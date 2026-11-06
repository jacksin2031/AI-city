import { expect, test } from "@playwright/test";

// Run the browser in English so a native required/pattern bubble would be unmistakable.
test.use({ locale: "en-US" });

test("tablet pairing form reports invalid codes in Japanese and can mask the code", async ({
  page,
}) => {
  await page.goto("/tablet");
  const input = page.getByLabel("8桁の接続コード");
  const submit = page.getByRole("button", { name: "街に接続", exact: true });
  await expect(input).toBeVisible();

  // The form must not rely on native browser validation messages.
  await expect(page.locator("form.flow-panel")).toHaveAttribute("novalidate", "");

  await submit.click();
  const alert = page.locator("#pairing-code-error");
  await expect(alert).toHaveText("8桁の接続コードを入力してください。");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", "pairing-code-error");

  await input.fill("123");
  await expect(alert).toHaveCount(0);
  await submit.click();
  await expect(alert).toHaveText("接続コードは8桁です。桁数を確認してください。");

  // Non-digits are dropped as they are typed and the code never exceeds 8 digits.
  await input.fill("12ab34567890");
  await expect(input).toHaveValue("12345678");

  // The mask control is optional, labelled and reversible.
  await expect(input).toHaveAttribute("type", "text");
  const hide = page.getByRole("button", { name: "コードを隠す" });
  await expect(hide).toHaveAttribute("aria-pressed", "false");
  await hide.click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue("12345678");
  const show = page.getByRole("button", { name: "コードを表示" });
  await expect(show).toHaveAttribute("aria-pressed", "true");
  await show.click();
  await expect(input).toHaveAttribute("type", "text");
});

test("a rejected pairing code shows the Japanese error without logging the code", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await page.goto("/tablet");
  await page.getByLabel("8桁の接続コード").fill("00000000");
  await page.getByRole("button", { name: "街に接続", exact: true }).click();
  await expect(page.getByText(/接続コードを確認してください/)).toBeVisible();
  expect(logs.join("\n")).not.toContain("00000000");
});
