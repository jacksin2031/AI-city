#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$cloudConfig = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cloud.json') -Raw | ConvertFrom-Json
if ($cloudConfig.projectId -ne 'ai-city-511822') { throw 'Unexpected project; inspect cloud.json before proceeding.' }

function Invoke-Cloud {
  param([Parameter(Mandatory)][string[]]$CloudArgs)
  $cloudOutput = & gcloud @CloudArgs --project=$($cloudConfig.projectId) --quiet
  if ($LASTEXITCODE -ne 0) { throw ('gcloud failed: ' + ($CloudArgs -join ' ')) }
  return $cloudOutput
}
function Read-CloudJson {
  param([Parameter(Mandatory)][string[]]$CloudArgs)
  $cloudRaw = Invoke-Cloud ($CloudArgs + @('--format=json'))
  return ($cloudRaw -join "`n" | ConvertFrom-Json)
}

$projectInfo = Read-CloudJson @('projects', 'describe', $cloudConfig.projectId)
if ([string]$projectInfo.projectNumber -ne $cloudConfig.projectNumber) { throw 'Project number mismatch.' }

Invoke-Cloud @('services', 'enable', 'run.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'cloudtasks.googleapis.com', 'firestore.googleapis.com', 'firebase.googleapis.com', 'identitytoolkit.googleapis.com', 'secretmanager.googleapis.com', 'aiplatform.googleapis.com', 'iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com', 'storage.googleapis.com')

$databases = @(Read-CloudJson @('firestore', 'databases', 'list'))
if (-not ($databases | Where-Object { $_.name -eq "projects/$($cloudConfig.projectId)/databases/(default)" })) {
  Invoke-Cloud @('firestore', 'databases', 'create', '--database=(default)', '--type=firestore-native', '--edition=standard', "--location=$($cloudConfig.region)", '--delete-protection')
}

$buckets = @(Read-CloudJson @('storage', 'buckets', 'list'))
foreach ($bucketName in @($cloudConfig.privateBucket, $cloudConfig.assetBucket)) {
  if (-not ($buckets | Where-Object { $_.name -eq $bucketName })) {
    Invoke-Cloud @('storage', 'buckets', 'create', "gs://$bucketName", "--location=$($cloudConfig.region)", '--uniform-bucket-level-access', '--public-access-prevention')
  }
  $bucketInfo = Read-CloudJson @('storage', 'buckets', 'describe', "gs://$bucketName")
  if ($bucketInfo.public_access_prevention -ne 'enforced' -or -not $bucketInfo.uniform_bucket_level_access -or $bucketInfo.location.ToLowerInvariant() -ne $cloudConfig.region) {
    throw "Bucket security or location drift detected: $bucketName"
  }
}
Invoke-Cloud @('storage', 'buckets', 'update', "gs://$($cloudConfig.privateBucket)", "--lifecycle-file=$(Join-Path $PSScriptRoot 'private-bucket-lifecycle.json')")

$repositories = @(Read-CloudJson @('artifacts', 'repositories', 'list', "--location=$($cloudConfig.region)"))
if (-not ($repositories | Where-Object { $_.name -like "*/repositories/$($cloudConfig.artifactRepository)" })) {
  Invoke-Cloud @('artifacts', 'repositories', 'create', $cloudConfig.artifactRepository, '--repository-format=docker', "--location=$($cloudConfig.region)", '--description=AI City development containers')
}
$queues = @(Read-CloudJson @('tasks', 'queues', 'list', "--location=$($cloudConfig.region)"))
if (-not ($queues | Where-Object { $_.name -like "*/queues/$($cloudConfig.generationQueue)" })) {
  Invoke-Cloud @('tasks', 'queues', 'create', $cloudConfig.generationQueue, "--location=$($cloudConfig.region)", '--max-concurrent-dispatches=2', '--max-dispatches-per-second=1', '--max-attempts=2', '--max-retry-duration=120s')
}

$accounts = @(Read-CloudJson @('iam', 'service-accounts', 'list'))
foreach ($accountName in @('ai-city-ci', 'ai-city-runtime')) {
  if (-not ($accounts | Where-Object { $_.email -eq "$accountName@$($cloudConfig.projectId).iam.gserviceaccount.com" })) {
    Invoke-Cloud @('iam', 'service-accounts', 'create', $accountName, "--display-name=$accountName")
  }
}
$roles = @(Read-CloudJson @('iam', 'roles', 'list'))
if (-not ($roles | Where-Object { $_.name -eq "projects/$($cloudConfig.projectId)/roles/aiCityCiVerifier" })) {
  Invoke-Cloud @('iam', 'roles', 'create', 'aiCityCiVerifier', "--file=$(Join-Path $PSScriptRoot 'ci-verifier-role.json')")
}
$expectedRole = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ci-verifier-role.json') -Raw | ConvertFrom-Json
$actualRole = Read-CloudJson @('iam', 'roles', 'describe', 'aiCityCiVerifier')
if (Compare-Object @($expectedRole.includedPermissions | Sort-Object) @($actualRole.includedPermissions | Sort-Object)) {
  throw 'CI role permissions drifted; refuse to grant a broader role.'
}
$projectPolicy = Read-CloudJson @('projects', 'get-iam-policy', $cloudConfig.projectId)
$ciBindings = @($projectPolicy.bindings | Where-Object { $_.members -contains "serviceAccount:$($cloudConfig.ciServiceAccount)" })
if ($ciBindings | Where-Object { $_.role -ne "projects/$($cloudConfig.projectId)/roles/aiCityCiVerifier" }) {
  throw 'CI identity has unexpected project roles; review before continuing.'
}
Invoke-Cloud @('projects', 'add-iam-policy-binding', $cloudConfig.projectId, "--member=serviceAccount:$($cloudConfig.ciServiceAccount)", "--role=projects/$($cloudConfig.projectId)/roles/aiCityCiVerifier", '--condition=None', '--format=none')

$pools = @(Read-CloudJson @('iam', 'workload-identity-pools', 'list', '--location=global'))
if (-not ($pools | Where-Object { $_.name -like "*/workloadIdentityPools/$($cloudConfig.workloadIdentityPool)" })) {
  Invoke-Cloud @('iam', 'workload-identity-pools', 'create', $cloudConfig.workloadIdentityPool, '--location=global', '--display-name=AI City GitHub')
}
$providers = @(Read-CloudJson @('iam', 'workload-identity-pools', 'providers', 'list', '--location=global', "--workload-identity-pool=$($cloudConfig.workloadIdentityPool)"))
$providerCondition = "assertion.repository_id == '$($cloudConfig.repositoryId)' && assertion.repository_owner_id == '$($cloudConfig.repositoryOwnerId)' && assertion.ref == 'refs/heads/main' && assertion.environment == 'development'"
if (-not ($providers | Where-Object { $_.name -like "*/providers/$($cloudConfig.workloadIdentityProvider)" })) {
  Invoke-Cloud @('iam', 'workload-identity-pools', 'providers', 'create-oidc', $cloudConfig.workloadIdentityProvider, '--location=global', "--workload-identity-pool=$($cloudConfig.workloadIdentityPool)", '--issuer-uri=https://token.actions.githubusercontent.com', '--attribute-mapping=google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref', "--attribute-condition=$providerCondition")
}
$provider = Read-CloudJson @('iam', 'workload-identity-pools', 'providers', 'describe', $cloudConfig.workloadIdentityProvider, '--location=global', "--workload-identity-pool=$($cloudConfig.workloadIdentityPool)")
if ($provider.attributeCondition -ne $providerCondition) { throw 'Existing WIF condition differs; do not silently widen trust.' }
$providers = @(Read-CloudJson @('iam', 'workload-identity-pools', 'providers', 'list', '--location=global', "--workload-identity-pool=$($cloudConfig.workloadIdentityPool)"))
if ($providers.Count -ne 1 -or $provider.oidc.issuerUri -ne 'https://token.actions.githubusercontent.com') {
  throw 'Unexpected identity provider or issuer; this pool is reserved for GitHub.'
}
$expectedMapping = @{ 'google.subject'='assertion.sub'; 'attribute.repository_id'='assertion.repository_id'; 'attribute.repository_owner_id'='assertion.repository_owner_id'; 'attribute.ref'='assertion.ref' }
if (@($provider.attributeMapping.PSObject.Properties).Count -ne $expectedMapping.Count) { throw 'Unexpected WIF attribute mapping.' }
foreach ($mappingKey in $expectedMapping.Keys) {
  if ($provider.attributeMapping.$mappingKey -ne $expectedMapping[$mappingKey]) { throw "Unexpected WIF mapping: $mappingKey" }
}
$principal = "principalSet://iam.googleapis.com/projects/$($cloudConfig.projectNumber)/locations/global/workloadIdentityPools/$($cloudConfig.workloadIdentityPool)/attribute.repository_id/$($cloudConfig.repositoryId)"
Invoke-Cloud @('iam', 'service-accounts', 'add-iam-policy-binding', $cloudConfig.ciServiceAccount, '--role=roles/iam.workloadIdentityUser', "--member=$principal", '--format=none')
Write-Output 'Cloud foundation initialized. No Cloud Run service or service-account key was created.'
