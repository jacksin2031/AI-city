# 公开源码初始导入记录

本机私人开发历史不随本次公开源码交付；以下只记录经白名单核验的文件及真实验证范围。

### 2026-11-04T21:58:48.328289+09:00 | TASK-M08-RELEASE-IMPORT | 20261104T125848Z-TASK-M08-RELEASE-IMPORT | COMPLETE
- UTC: 2026-11-04T12:58:48.328289+00:00
- Goal: 白名单干净源码初始交付；软件/文档/打包已验，远端分支状态另以Git提交核对。
- Files and corresponding code/sections:
  - ADD `.gitattributes`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `da1dd3f46fa7cad0c3076ccc3dcc2febef5c1cf2978600aa855dcdbd1c122d15`
  - ADD `.gitignore`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0e633f2500aad525b6a0bea8039549432be6291c27a152f051b780a854be78b6`
  - ADD `AGENTS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1221c205d3f166b7519ef198318f23a8486008ca30521b76eebcdf06d03b9c1b`
  - ADD `DISTRIBUTION.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ccbdde3ef9aa871fe93855e549f01a7464c463e12c5b7da0384a8b1633da6cf9`
    ```text
{
  "schema_version": "1.0.0",
  "release_id": "spine-skin-tool-0.1.0-20261104",
  "source_directories": ["src", "ui", "scripts", "tests", "templates", "schemas", "prompts", "fixtures"],
  "source_top": ["AGENTS.md", "README.md", "使用说明.md", "文件分类与发布说明.md", "DISTRIBUTION.json", ".gitignore", ".gitattributes"],
  "public_docs": ["QUALITY.md", "TEXTURE_CONSTRUCTION_BASELINE.md", "REFERENCE_PIXEL_MEASUREMENTS.md", "CHARACTER_PIPELINE.md", "SHARED_CHARACTER_FLOW.md", "GENERATORS.md", "REVIEW_PIPELINE.md", "REPAIR_PIPELINE.md", "REVIEW_CALIBRATION.md", "CHAT_VALIDATED_FLOW.md", "TEXTURE_ONLY_EDIT_POLICY.md", "TEXTURE_COMPARISON.md", "OPS.md", "CODEX_IMPLEMENTATION_SPEC.md", "DECISIONS.md", "CHANGES_GUIDE.md", "RELEASE_STATUS.md"],
    ```
  - ADD `README.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2a22b83044a1710c817d0604771648aa5a0a7695f2bbb556e0d90b6355978083`
  - ADD `docs/CHANGES_GUIDE.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1a7b28c56ee76d0aa244e158ee86deff1743e7f5332a222a49f8d5966f314f5c`
  - ADD `docs/CHARACTER_PIPELINE.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `538e9f10f213faa5cb5f7cc21767afddc0f5ce01476f654bafaec84e9d3ec42e`
  - ADD `docs/CHAT_VALIDATED_FLOW.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ae3d3c1d1b75661d0e9871b1af8a2295c25f12fbc8326eecaf8de8ddc364cf4f`
  - ADD `docs/CODEX_IMPLEMENTATION_SPEC.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fe590689a2df7fc6d4f142c1f5306a488db30d512496fb842ccc4c096dae8bd4`
  - ADD `docs/DECISIONS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `b1599dbb269198f45f99d7098e7ed859ffff6bffdafe51667586a2a78d4e9a4c`
  - ADD `docs/GENERATORS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2166b98f98d43fe0c404648aa1dadf2a28dd8e1746297905b7345ce7b594e4e5`
  - ADD `docs/OPS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a09127c6881ee69cfc83e63e043ca662145f947f78ebaf7dc8781edb89a3d494`
  - ADD `docs/QUALITY.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cb4a18cb9ca8badd5c6a8da9056c216c288496a52f80ad2d58edbff9b2376b68`
  - ADD `docs/REFERENCE_PIXEL_MEASUREMENTS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0ef257f2dc60d1126a2166c4c9ab6a2bff55d91a545a9402fc7acb6bb6f6e3ee`
  - ADD `docs/RELEASE_STATUS.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fc69d8e4d3b69a34a5626caf1dcc775734640d9cd0e8d8f4b81318b9bf35679b`
  - ADD `docs/REPAIR_PIPELINE.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8267651f52891b2706dacedefa460188b4d0db2b33599e1f70779a70edcfe99c`
  - ADD `docs/REVIEW_CALIBRATION.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c71bbeb4ecab0c2d19d78e2b1d015bbdc45eab0c259bbcd569bdb9c109bbd5df`
  - ADD `docs/REVIEW_PIPELINE.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `155a61fa1090bebe640f147745a90e7fbe7c5e4e335ec9aced754a1d48439ae9`
  - ADD `docs/SHARED_CHARACTER_FLOW.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d4dd93878bfedba4e912304d4d691b242efbeeb2bd8a20f0e11a40b0d7201962`
  - ADD `docs/TEXTURE_COMPARISON.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `131a8337d0f383956f57a5faeb89e5b4c2091799c17565f0bb4d29bed3d3e02c`
  - ADD `docs/TEXTURE_CONSTRUCTION_BASELINE.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `38151c3a8c4af0696bd756394fbe7f897eac98cab0a370bc5a71147f92f0d7fa`
  - ADD `docs/TEXTURE_ONLY_EDIT_POLICY.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2ebb3dc8bb0d966f82b0cc1ddcd32bf0baa6c8be84029aef99e9da43dcddc40c`
  - ADD `fixtures/synthetic/shared-design/README.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2f2861c95cda4dae57724b00e68b363cc57c570b4f6c498586fa58c2a3cf5473`
  - ADD `fixtures/synthetic/shared-design/character-reference.png`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `07eb2275e52cd6d97e2b93101c2d330465d40a57f25959fbfc1574dbc46a772b`
  - ADD `fixtures/synthetic/shared-design/design.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a0983194e7b6b8e43a1755d9bb100950abcc71980b1491277d305237c0e352a7`
    ```text
{
  "schema_version": "1.0.0",
  "character_id": "synthetic-fixture",
  "photo": {
    "file": "character-reference.png",
    "sha256": "07eb2275e52cd6d97e2b93101c2d330465d40a57f25959fbfc1574dbc46a772b"
    ```
  - ADD `runtime/README.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2c48f41258deab3f3f90c9b9390014e885fba48e42a823fb531ba37e4cb868d5`
  - ADD `runtime/config/calibration.example.json`; location `initial clean source import`; lines `1-1`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `63ddf5b2f378dc8973178c4d52e55aeca51f1c17722cacf93a4fb694118e7f3c`
    ```text
{"live_enabled":false,"max_live_calls":6,"timeout_seconds":600}
    ```
  - ADD `runtime/config/defaults.toml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d1064a094b11648a5f2ed63e262cdcbff3884123ad77140b5dc441f52db54e7c`
    ```text
[server]
host = "127.0.0.1"
port = 8765

[execution]
mode = "mock"
    ```
  - ADD `runtime/config/design.example.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `75455ddcedf89803970aaf464c30c421d833945b9cdd70bf47966d94bfcb33bb`
    ```text
{
  "live_enabled": false,
  "upload_consent": false,
  "max_live_calls": 1,
  "timeout_seconds": 600
}
    ```
  - ADD `runtime/config/local.example.toml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `6a293f927bd034007226599d0013f5c4e0cfc1c3780d5d70c38bdf0f15066a33`
    ```text
# Copy to local.toml for local machine only; never commit local.toml.
[execution]
mode = "mock"
paid_api_enabled = false

[spine]
    ```
  - ADD `runtime/config/providers.example.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `4804df3d76835bdc017e200b13b2405e75ea648ef8032994c7e10b6fba1b3121`
    ```text
{
  "schema_version": "2.0.0",
  "live_enabled": false,
  "upload_consent": false,
  "billing_source": "UNVERIFIED",
  "max_live_calls": 1,
    ```
  - ADD `runtime/config/quality-policy.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d02cac204723c5f901c80112924fd4fbb9e2fdc4267f1e7032e9012813cd4171`
    ```text
{
  "revision": "quality-mvp-004",
  "status": "EXPERIMENTAL_CONTROLLED_CALIBRATION_ADVISORY_ONLY",
  "automatic_visual_pass_enabled": false,
  "review_schema": "1.0.0",
  "alpha_threshold": 32,
    ```
  - ADD `runtime/config/repair.example.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0740de403089debf1b407e1c14632f9a42ddc36faa15584b9334489d574494b8`
    ```text
{
  "max_cycles": 3,
  "max_image_calls": 6,
  "max_calls_per_part": 3,
  "max_visual_calls": 3,
  "live_generation": false,
    ```
  - ADD `runtime/config/review-criteria.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `5777e94dc0d1d5f97a81b949906b99657a90c6d91501a2b37dca7485e72248f1`
    ```text
{
  "revision": "review-criteria-006",
  "authority": "EXISTING_USER_TEXTURE_SPEC",
  "documents": [
    "docs/QUALITY.md",
    "docs/TEXTURE_CONSTRUCTION_BASELINE.md"
    ```
  - ADD `runtime/config/review.example.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `75455ddcedf89803970aaf464c30c421d833945b9cdd70bf47966d94bfcb33bb`
    ```text
{
  "live_enabled": false,
  "upload_consent": false,
  "max_live_calls": 1,
  "timeout_seconds": 600
}
    ```
  - ADD `runtime/config/size-trials.toml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ea6f6f6d1797d30cfc93a90250fafb9d1acbabc338c6f4189ebbf3aa616fba06`
    ```text
# 原始 PNG/附件观测值仅用于当前实验起点。修改后应升级 revision 并重新装配/验收。
# width/height 仅代表拟导出贴图画布，不代表生成器原图或 Spine 世界坐标。
schema_version = "1.0.0"

[trial]
id = "reference-hair-size-trial"
    ```
  - ADD `runtime/js/.npmrc`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `63e6e5f9b329638d5634340d150b2be58e540cc8dfc53fd54fbcfb57714334b6`
  - ADD `runtime/js/package.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2af1c74063652877fb99c58b61afa3cecf3b1099deb66205df2e52dc857135bf`
    ```text
{
  "name": "spine-skin-tool-render-runtime",
  "version": "0.1.0",
  "private": true,
  "description": "Pinned independent Spine Canvas preview and browser verification",
  "packageManager": "pnpm@11.9.0",
    ```
  - ADD `runtime/js/pnpm-lock.yaml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e1855a1828bae596d38bd67c33c323b972e97714c713bdfc572fd717a055c668`
    ```text
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

    ```
  - ADD `runtime/license-manifest.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fae1a81cea22b06000cf06f51c7ec8c458e0810febf3be5e6814e999e757c62b`
    ```text
{
  "schema_version": "1.0.0",
  "assets": [],
  "note": "原始角色及参考图未复制进工具，公开再分发许可未验证；Spine Editor 未安装。",
  "components": [
    {
    ```
  - ADD `runtime/python/pyproject.toml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3747d937da334396eda14bf0b9ca3b12370ceb51aafd7c7533d37df21182060f`
    ```text
[project]
name = "spine-skin-tool-runtime"
version = "0.1.0"
requires-python = "==3.12.10"
dependencies = [
    "pillow==12.0.0",
    ```
  - ADD `runtime/python/uv.lock`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `73b80130fe89ec8fa15ef01841ae8a65cdaaf7484a7d32246c2227c2a71ab0ce`
  - ADD `runtime/versions.toml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `498b9e4b43bca3fba336fe44b69ba7be1ed3a8e27562efb0420e672abe84b80b`
    ```text
[product]
version = "0.1.0"
api_schema = "1.0.0"
job_schema = "1.0.0"
asset_schema = "1.0.0"
design_schema = "1.0.0"
    ```
  - ADD `scripts/assemble.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3fdc20245847da391602f4ca5ed1f1b134093c7b5b0bdcfff8a172d03b958468`
    ```text
"""固定 profile CLI；所有新产物限定在本工具 runtime/work 或 output 内。"""
import argparse
import json
from pathlib import Path
import sys

    ```
  - ADD `scripts/assemble_chat_character.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `bb44fb1940fbd65b75ec7bda6fdef68fa37c686d044319c93e83c8f1c0e42dc5`
    ```text
"""Legacy command compatibility; geometry/raster logic lives only in the shared core.
For frozen-design exports use scripts/character.py assemble.
"""
from pathlib import Path
import sys,json,argparse
ROOT=Path(__file__).resolve().parents[1]
    ```
  - ADD `scripts/bootstrap.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `38e00aad5b8a59b217ad646332c835ae364a7c6bff1cf24e2e9ca54d6bd1c216`
    ```text
#!/usr/bin/env python3
"""从现有的已锁定工具重建本地环境；本阶段全程离线且不安装全局软件。"""
from __future__ import annotations

import argparse
import os
    ```
  - ADD `scripts/calibrate_review.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0a64a37bb06ad6291c1ed5180f66e03e3ecf78eec29fde4d732320089a92c602`
    ```text
"""Prepare/freeze/score/run normative review calibration. Real runs must be explicit."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.review_benchmark import prepare,score,run,request,folder,save

    ```
  - ADD `scripts/capture_calibration.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3009fe0b521bf258b22190f5ba5a4e198ba03f4bbd55dafe204dffd8d70eac39`
    ```text
/* Controlled private defect fixtures rendered by the actual Runtime; no cloud calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{start}=require('./capture_review.cjs');
const {chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));assert(path.resolve(config.output).startsWith(path.join(root,'runtime/work/M05/')));
    ```
  - ADD `scripts/capture_review.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d4f3a2d3df308881a4fadf38c4e64663ce4eddd47b5aa6dfd05896c579be8292`
    ```text
/* Actual Spine evidence renderer. Private config only; no model or external requests. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
function work(p){const absolute=path.resolve(p),relative=path.relative(path.join(root,'runtime/work'),absolute);assert(!relative.startsWith('..')&&!path.isAbsolute(relative),'PRIVATE_WORK_REQUIRED');return absolute;}
function start(python,bundle){return new Promise((resolve,reject)=>{
 const child=spawn(python,['-B',path.join(root,'scripts/preview.py'),'--source',path.join(bundle,'skeleton.json'),'--atlas',path.join(bundle,'skeleton.atlas'),'--port','0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    ```
  - ADD `scripts/character.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2e6e4f6f0294ea5b39edc5acfbae1b403b422009e17bb2719a88563d6490756e`
    ```text
"""Thin CLI for the same experimental design/assembly service used by the UI."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
    ```
  - ADD `scripts/check_acceptance.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c4969b55536be76ba664a73634992a1be98c75dd6449401187e5f20f6f3dcefd`
    ```text
/* Read-only actual browser. No model, backup, install or restore actions. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
function ledger(){return ['M04/generation/jobs','M05/reviews','M07/design-calls'].map(n=>{const base=path.join(root,'runtime/work',n),files=fs.readdirSync(base,{recursive:true}).filter(f=>/^(codex|review|design)-call-.*\.reserved$/.test(path.basename(f))).sort();return crypto.createHash('sha256').update(JSON.stringify(files.map(f=>[f,fs.readFileSync(path.join(base,f),'utf8')]))).digest('hex');});}
async function main(){const base=process.argv[2];assert.equal(new URL(base).hostname,'127.0.0.1');const before=ledger(),b=await chromium.launch({channel:'msedge',headless:true}),errors=[],writes=[];
 try{const p=await b.newPage({viewport:{width:1250,height:1050}});p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('409 (Conflict)'))errors.push(m.text());});p.on('request',r=>{if(r.method()!=='GET')writes.push(r.method());});await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    ```
  - ADD `scripts/check_assembly.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0f13c5e12cd9c8782d7acc3a0070392acebb44462c03626d6983cdce8ced6835`
    ```text
// M03: real runtime verification and immutable-bundle reload.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const {chromium}=createRequire(path.join(root,'runtime/js/package.json'))('playwright');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
    ```
  - ADD `scripts/check_calibration.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `71b302d7dc7fd2ad70328f5ecb51db1eef609cb8f5df8280c19343814d295917`
    ```text
/* Read-only calibration UI/API regression, never sends a model request. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783',id=process.argv[3];assert.equal(new URL(origin).hostname,'127.0.0.1');assert(/^bench-[a-f0-9]{32}$/.test(id));
 const base=path.join(root,'runtime/work/M05/benchmarks'),reservations=()=>fs.readdirSync(base).filter(n=>n.endsWith('.reserved')).sort();const before=reservations(),browser=await chromium.launch({channel:'msedge',headless:true});
    ```
  - ADD `scripts/check_coarse_style.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `193d602986d14d2352dc76fd647159b63fffc4c7de1d42ce2524db4f31479d5f`
    ```text
/* Read-only real browser: scoped user opinions, named trials, deterministic pose. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],ids=process.argv.slice(3);assert.equal(new URL(origin).hostname,'127.0.0.1');assert.equal(ids.length,3);
 const folder=path.join(root,'runtime/logs/M07-RETEST011/coarse-regression');fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),result={errors:[],requests:[],cases:[],model_calls:0};
    ```
  - ADD `scripts/check_direction_rules.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7ee44f86ad74470214875c6bdca69fdfd9f1abece114c3ed45f12b3f02016911`
    ```text
/* Regression for animation-hidden ears, skin outlines and direction occlusion.
 * No generation or outbound model calls. Uses actual Runtime when URLs are given.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'ui/orientation.js'));
    ```
  - ADD `scripts/check_generation.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ba24c9f8ae08c0c2108d126f3d15e53326661b95ec8c015381b708af367db367`
    ```text
/* Browser preflight/gating checks only. Never enables live execution. */
const {chromium}=require('../runtime/js/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:8780';
const output=path.join(root,'runtime/logs/M04-API/browser');fs.mkdirSync(output,{recursive:true});
(async()=>{
    ```
  - ADD `scripts/check_hair_trials.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3d38f69b1f992573c13239325c6d56e577509ca3d074aca786156459d592dee4`
    ```text
/* Actual local Runtime and attempt UI; never sends a model request. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],ids=process.argv.slice(3);assert.equal(new URL(origin).hostname,'127.0.0.1');assert(ids.length);ids.forEach(id=>assert.match(id,/^flow-[a-f0-9]{32}$/));
 const output=path.join(root,'runtime/logs/M07-RETEST011/hair-regression');fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true}),evidence={model_calls:0,errors:[],cases:[]};
    ```
  - ADD `scripts/check_pipeline.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9db62d7f404d5c8dfc2c26ac1b759ab817da7d798494a889b2c2484934f260c1`
    ```text
/* Genuine UI requests and Spine runtime, local replay only, NEVER enables models. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin='http://127.0.0.1:8783',source=process.argv[2]||'runtime/work/M05/corrected/c02',out=path.join(root,'runtime/logs/M07/browser');assert(source.startsWith('runtime/work/')&&!source.includes('..'));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
    ```
  - ADD `scripts/check_pipeline_restore.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `94d32bcbf69e369a463e78546f273615c4157f534456aa3b5996c03fec40f46c`
    ```text
/* Read-only persisted task/ZIP/runtime check. Run after restarting the workbench. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const input=JSON.parse(fs.readFileSync(path.resolve(root,process.argv[2]||'runtime/logs/M07/preview-cases.json'),'utf8')),origin='http://127.0.0.1:8783',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
    ```
  - ADD `scripts/check_preview.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `37d14dcfdb8988e22aa9365b88066c23fd442d5fd89b1af83ad9c3e84e36eb23`
    ```text
// Real installed Edge in a temporary Playwright profile; no cloud calls.
const {createRequire}=require('node:module');
const path=require('node:path'), fs=require('node:fs'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {chromium}=createRequire(path.join(root,'runtime/js/package.json'))('playwright');
(async()=>{
    ```
  - ADD `scripts/check_rebuild_flow.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `50092e0ea78eec8dfce4a5bb6d9a1055f2b7a08138f98d2c2221f00082daa76b`
    ```text
"""显式的本机工作台集成验收；只临时修改 M03 私有测试部件并最终恢复。"""
import hashlib
import io
import json
from pathlib import Path
import sys
    ```
  - ADD `scripts/check_repair.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `09c1d12f57a5567c0ca5059465476dbe81a4ffb09060b6b02d47d4c6da788f2d`
    ```text
/* Real M06 UI/local repair checks; NEVER enables or invokes a model. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783';assert.equal(new URL(origin).hostname,'127.0.0.1');const ids=JSON.parse(fs.readFileSync(path.join(root,'runtime/logs/M06/tasks.json'),'utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
    ```
  - ADD `scripts/check_repair_restore.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cd2103240a4c82de611e7219a9ec0dce8fec7bae5ccad6acce77c6242b057b95`
    ```text
/* Read-only restart/UI persistence check. Never creates or advances a task. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin='http://127.0.0.1:8783',id='repair-096dce88300849ba86c84acdacba2e5e',browser=await chromium.launch({channel:'msedge',headless:true});
 try{
    ```
  - ADD `scripts/check_review.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8103d8c4fc4f1361f2aa2838a0f0a36cebe5e82b15eb9d4d4072541e213d1b1f`
    ```text
/* Actual review workbench regression. Local rendering only; NEVER invokes vision. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2]||'http://127.0.0.1:8783';assert.equal(new URL(origin).hostname,'127.0.0.1');
    ```
  - ADD `scripts/check_shared_flow.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ef729b3397431b5dcd07a8f1e0174c499e229b60e6ec335f9990959d20c70e31`
    ```text
/* Actual UI/CLI replay equivalence, no live generation or outbound service calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
const url=process.argv[2]||'http://127.0.0.1:8783',casesPath=process.argv[3];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
    ```
  - ADD `scripts/check_texture_compare.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8d6cad5240e5248df776665e1621d3177b392f3e4a876c1baf7673fdf827dd6c`
    ```text
/* Real local browser, read-only rejected-asset comparison; no model calls. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
async function main(){
 const origin=process.argv[2],session=process.argv[3];assert.equal(new URL(origin).hostname,'127.0.0.1');assert.match(session,/^texture-[a-f0-9]{32}$/);
 const out=path.join(root,'runtime/logs/M07-TEXTURE-COMPARE');fs.mkdirSync(out,{recursive:true});
    ```
  - ADD `scripts/check_trial_display.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `48ba00aa19a5b8d428b81988899f3fb0aa836a7c3ea2c6a81410d99deac76b92`
    ```text
/* Actual loopback browser; reads saved results only, never requests generation. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{chromium}=require(path.join(root,'runtime/js/node_modules/playwright'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function reservations(){return ['runtime/work/M04/generation/jobs','runtime/work/M05/reviews'].map(base=>{const files=fs.readdirSync(path.join(root,base),{recursive:true}).filter(f=>/^(codex|review)-call-.*\.reserved$/.test(path.basename(f))).sort();return {count:files.length,sha256:sha(JSON.stringify(files.map(f=>[f,sha(fs.readFileSync(path.join(root,base,f)))])))};});}
async function main(){
    ```
  - ADD `scripts/check_trials.cjs`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9dfea2fc315181e9d0f8e32e004b1044b74f6a376630efd76190a56c7ac143e1`
    ```text
/* Real browser checks for local specification experiments; no image model calls. */
const {chromium}=require('../runtime/js/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),url=process.argv[2]||'http://127.0.0.1:8774';
const output=path.join(root,'runtime/logs/M04/browser');fs.mkdirSync(output,{recursive:true});
(async()=>{
    ```
  - ADD `scripts/configure_subscription.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f526f01a343e21c5b76eb63ba13c7d48a14308af54df7af24b9116b3f97b8173`
    ```text
"""Local config only. Never reads, copies, logs or embeds authentication tokens."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.codex_subscription import login_status

    ```
  - ADD `scripts/doctor.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `316a01f03e2e79ff18df107aee281c7864d3f4d9dfcc0af561b9477d88cbccea`
    ```text
#!/usr/bin/env python3
"""只读基础环境检查；--production 不表示生产功能已经实现。"""
from pathlib import Path
import sys

sys.dont_write_bytecode = True
    ```
  - ADD `scripts/maintenance.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cc185960888fb6df5293e9387ab71dbb5f31f1e826a4dfff2c0c97d3fed3c577`
    ```text
"""M08 local-only CLI. Model calls exist ONLY in explicit blind-run via pipeline."""
import argparse,json,sys,time,unittest,uuid,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.maintenance import create_archive,verify_archive,restore_archive,fingerprint,inventory
from spine_skin_tool.acceptance import seal,report,artifact,attest
    ```
  - ADD `scripts/package_release.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ac1d86c8bcc7608191d447d30c684739c1c15bd954391a2800fb31ef67453f5a`
    ```text
"""Audit/build the public source allowlist; never packages private runtime state."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.distribution import audit,build

    ```
  - ADD `scripts/pipeline.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `b48e1f0ec444de629bf2e560bf6bdc5691047a5b961841e7f6dea7d8cb2b1d03`
    ```text
"""CLI to the same whole-character service as /characters. Private input/output only."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.design import private_path
from spine_skin_tool.pipeline_service import dispatch
    ```
  - ADD `scripts/prepare_hair_template.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1e024cf595527df1d8685a3ee292bea2757a75a44df3220eab0ec152c996f8aa`
    ```text
"""Compatibility entry: shared original-head/ear template preparation."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
    ```
  - ADD `scripts/prepare_repair_validation.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7456dcd058256647e342efeee5efcdc243cac15255b68a08501337c351e6f9ff`
    ```text
"""Private M06 validation fixtures; never modifies original characters or calls a model."""
from pathlib import Path
import argparse,json,random,shutil,sys,uuid
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.design import private_path,digest
    ```
  - ADD `scripts/preview.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9fa2a2d2e3a833f62b871800269c8556e41bde9d817ab2ae63c127053386ec7b`
    ```text
"""仅 loopback、仅显式资源白名单的原始母版预览服务。"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
    ```
  - ADD `scripts/record_change.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1cd4cc69730e8d27dbe6764860736da9174f5ccc3bd7d63abfcee6204be166e1`
    ```text
#!/usr/bin/env python3
"""Create a timestamped *draft* change record from real uncommitted Git paths.

A draft has NOT_RUN tests and a PARTIAL state. Codex MUST fill and verify it.
"""
from __future__ import annotations
    ```
  - ADD `scripts/reference_assets.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c807ac4aaeb73ca9ce8614ddc2a7711f3d345158df6cb24f4c4daba53cbbc8f8`
    ```text
"""Import only the required licensed reference files into ignored local storage."""
import argparse,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.reference_assets import import_library,inspect

    ```
  - ADD `scripts/repair.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fb9c2ace456d6c071256195fdd7d2c7450d162b50a880b3d775faed4ae3811b0`
    ```text
"""CLI for the shared durable M06 repair core."""
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.repair_service import dispatch
from spine_skin_tool.design import private_path
    ```
  - ADD `scripts/review.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `97fed40bab2a8358da53ffa7b46b72820ad5cb1608ced3e3b169730cd5aab1a3`
    ```text
"""Quality review CLI; same operations as the loopback workbench."""
from pathlib import Path
import sys,argparse,json
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.review_service import dispatch
    ```
  - ADD `scripts/start_trials.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d593e8fc26ca9359068596a3679643d7a9ada580854ddab86772fd3c22bad5a0`
    ```text
"""启动保留原头模/耳朵/表情的发型与服装规格试验。"""
from pathlib import Path
import argparse
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
    ```
  - ADD `scripts/sync_changelog.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `323421458861a3af4066ca6d67bf4f17ef46fa968bdfb86b08b951862e355dd2`
    ```text
#!/usr/bin/env python3
"""Sync one CURRENT JSON entry to the human-readable CHANGELOG batch section.

Only changes its own batch; historical entries are not silently rewritten.
Use after Codex has populated a truthful JSON entry and before verify_changes.py.
"""
    ```
  - ADD `scripts/tool.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a426402a51dd5816909512f3ec03342d20105380269193a158172c23c145de9b`
    ```text
#!/usr/bin/env python3
"""基础配置 CLI；路径不依赖调用者当前工作目录。"""
from pathlib import Path
import sys

sys.dont_write_bytecode = True
    ```
  - ADD `scripts/validate_pipeline.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f24095206ca6d3eae96843a6b9c10eb2664cb053aaba3244d6b858346fd01a06`
    ```text
"""Real local fixed-input equivalence/capture via the public pipeline service. No models."""
import argparse,json,sys,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.pipeline_service import dispatch
from spine_skin_tool.pipeline import DEFAULTS
    ```
  - ADD `scripts/verify_changes.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8bdd64f8a1bddf37518bd6513ce9865b8345fd238f3d54c3f3a392b2cbf04a31`
    ```text
#!/usr/bin/env python3
"""Verify that every non-metadata Git change is mapped to a fresh timestamped log entry.

Stdlib only. Intentionally NOT a replacement for tests or code review.
Initial import requires a log covering the newly added repository files.
"""
    ```
  - ADD `src/spine_skin_tool/__init__.py`; location `initial clean source import`; lines `1-1`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `00da01694982a13a2be54892ac934202808b53f884c50595131c1fc15e7a96b9`
    ```text
"""Spine Skin Tool 基础配置；生成和渲染在后续里程碑实现。"""
    ```
  - ADD `src/spine_skin_tool/acceptance.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9c40346ee4560b7d86a7aeb3f3613d2c89c305588f2194d1a42b81aa73355e69`
    ```text
"""Evidence-bound M08 status, never a production or visual approval mechanism."""
import json,hashlib
from pathlib import Path
from .assembly import canonical
from .design import private_path,require,digest
from .pipeline_store import atomic
    ```
  - ADD `src/spine_skin_tool/appearance_opinions.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9160827a787855003f6f707b42b8c1e1e96cafddcb439e6444c07d2d88b1b4be`
    ```text
"""Local user appearance opinions, bound to an exact candidate, not release QA."""
import json,re
from .design import private_path,require


def lookup(root,task,manifest):
    ```
  - ADD `src/spine_skin_tool/assembly.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `aed7a724cbd2499f7b58473a84d974acca906e21594b3594e2895f344bd6669e`
    ```text
"""实验 profile 的确定性装配；不适配未知几何、不改源文件。"""
import copy
import hashlib
import io
import json
import os
    ```
  - ADD `src/spine_skin_tool/blind_display.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c57590962738fbe4d07108e6699259c6aef3cfdcb8d2acba624bba11408dff83`
    ```text
"""Read-only, batch-bound original-photo comparison. No generation or approval."""
import json,re,time
from .blind_trials import load,folder,metrics
from .design import photo_path,private_path,require,digest
from .pipeline_service import report,preview
from .review import read_review,review_dir
    ```
  - ADD `src/spine_skin_tool/blind_trials.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `61f5b550cdd343be9870b3d436768a74194c0841f97d11e67798b4c9432d528e`
    ```text
"""Register genuinely new local photos, then use the EXISTING full pipeline."""
import hashlib,json,re,time,uuid
from pathlib import Path
from .assembly import canonical,VERSIONS
from .design import private_path,photo_path,require,digest
from .photo_import import normalized
    ```
  - ADD `src/spine_skin_tool/character.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2ec9e1ae2fc75edc2db7e7026d624ccad9818d2a23831cb3c57387b837a82866`
    ```text
"""Shared deterministic full-character assembly. Never invokes an image model."""
from pathlib import Path
import copy,json,shutil,hashlib,os,uuid
from PIL import Image
from .assembly import make_profile,build,verify_bundle,bundle_zip,canonical,VERSIONS
from .template import inspect_template
    ```
  - ADD `src/spine_skin_tool/character_flow.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `97ff6f3cdb5ad9a682ccec3664fc76b7554422a5a78b241b1ec8a892157513f9`
    ```text
"""Frozen requests, verified bindings and atomic full-character exports."""
import copy
import hashlib
import json
import os
from pathlib import Path
    ```
  - ADD `src/spine_skin_tool/character_service.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ccc029f592b329fe35c51ca1a4ecf30b748a65ecd1ea03d3efe8bea5e41653c0`
    ```text
"""Transport-neutral service; CLI and loopback HTTP call the same operations."""
import json
from pathlib import Path
from .design import (ROOT,freeze_design,load_design,draft_design,keys,require,private_path,VERSIONS)
from .character_flow import prepare_requests,bindings_from_directory,assemble_character

    ```
  - ADD `src/spine_skin_tool/character_session.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1bea0db00fc766b20791b5a57f9c05b624753af8b2cb08c4cc3414ddf492a0c0`
    ```text
"""Per-character CLI conversation ownership and durable send intents, no transport."""
import contextlib,json,re,time,uuid
from pathlib import Path
from .design import private_path,photo_path,digest,require,VERSIONS
from .assembly import canonical
from .pipeline_store import atomic,read
    ```
  - ADD `src/spine_skin_tool/cli.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c38fa6ad46dcf52775a1ec22c4868232ae586b39561fbf0ff4178100f91972fd`
    ```text
"""里程碑 1 仅提供 config / doctor，尚无生成或装配命令。"""
from __future__ import annotations

import argparse
import json
import sys
    ```
  - ADD `src/spine_skin_tool/codex_subscription.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `68e3467fc0f92a103ca3aef84762af48c5f55bc3aab9f5bc0a95fbee7c3915c1`
    ```text
"""Official Codex CLI built-in ImageGen with ChatGPT sign-in; never an API fallback."""
import json,contextlib
import os
from pathlib import Path
import shutil
import subprocess
    ```
  - ADD `src/spine_skin_tool/component_prompts.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f0206be33800eddf9110d3ec7d0758d9a3b5a11151cd4b2b6e49c53d6583c3ef`
    ```text
"""Current per-part briefs. No unrelated anatomy/ear/face instructions in clothes."""
def brief(part,description,attempt=0):
 view='REAR' if part.endswith('BACK') else 'FRONT'
 common=f'Create ONE isolated transparent RGBA PNG game component {part}, strict orthographic {view}. Match the broad illustrated 2D chibi style of the original references, with simple material-relative colored outlines. Use the original photo as design reference; unseen clothing is an authorised coherent design choice. Output the named component only, fully inside the image. '
 if part.startswith('LEG'):
  body='ONE TROUSER LEG WITH A COMPACT SHOE, a clothing component for a paper-doll game rig. A short broad fabric tube, rounded at its upper end, with a simple rounded shoe attached at the bottom. The whole tube is trouser fabric in the chosen trouser color; match the approximate outfit palette. Sparse fold marks, clear colored contour, simplified Harri proportions. Image1 supplies outfit cues, Image2 original Harri leg supplies construction only, Image3 original component art supplies broad drawing style. '
    ```
  - ADD `src/spine_skin_tool/config.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a360493f618a7a215021b2d53dae4756529b972ddc8cd44f3c013317dbb43a8c`
    ```text
"""严格的本地配置入口；读配置不会创建目录或启动外部服务。"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path, PurePosixPath, PureWindowsPath
    ```
  - ADD `src/spine_skin_tool/design.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a65b1d2403564eedfe4221606447c1ee9a0e5d358383e25ec7a41985609e04fd`
    ```text
"""Strict experimental design contract shared by the UI, CLI and part generation."""
import copy
import hashlib
import json
import math
from pathlib import Path
    ```
  - ADD `src/spine_skin_tool/distribution.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f8440d1c31ded507f23de614fcf68f9b7e6422d2b4fc957bead175f3987219ef`
    ```text
"""Allowlisted source distribution, with no traversal through private runtime data."""
import hashlib,json,re,zipfile
from pathlib import Path
from .design import require

EXTENSIONS={'.py','.js','.cjs','.html','.css','.json','.toml','.yaml','.yml','.md','.txt','.sql'}
    ```
  - ADD `src/spine_skin_tool/ear_geometry.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `da75b5cfac5140951e0272b8ac5eb9dd37a6c6fe06c5b0d6198b360206baf09f`
    ```text
"""Measured fixed-head ear roots and deterministic painted-ear observations.

Only geometry/measurement: never paints, stretches or masks delivered PNGs.
"""
import math,statistics,json
from collections import Counter
    ```
  - ADD `src/spine_skin_tool/ear_pass.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cf8db4c4c0e8f9a6a727e8511df7edd01079ef196d75547614267918dace1904`
    ```text
"""Fixed-base ear-only pass. No hair repaint, old-ear pixels, masks or new rig slots."""
import copy,hashlib,json,re
from pathlib import Path
from PIL import Image,ImageDraw
from .assembly import canonical,verify_bundle
from .design import private_path,require,digest,load_design,photo_path
    ```
  - ADD `src/spine_skin_tool/ear_policy.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `de50626dddde062bdbe7f0fbc1ae0c36be851594d37e200d8809afa86a647df8`
    ```text
"""Evidence-bound ear visibility, independent of the model's proposed ear_mode."""
import hashlib,json
from .design import require,keys,photo_path,digest,private_path
from .assembly import canonical

REVISION='ear-visibility-002'
    ```
  - ADD `src/spine_skin_tool/ear_service.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3045f388a298928db134fc187a4151dd45d654d8268bfb6c7540aea1185a6f7c`
    ```text
"""Explicit local photo-ear review and standard-ear augmentation of saved candidates."""
import json,time,uuid
from .design import private_path,require,digest,load_design,photo_path
from .assembly import verify_bundle
from .pipeline_store import read,commit,lease,directory
from . import ear_policy,standard_ears
    ```
  - ADD `src/spine_skin_tool/environment.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `26b9ff6480b41ba0c6ac746e5c00737f6352702964b213135771a9d5d6e58a33`
    ```text
"""版本清单、受控子进程环境和基础开发环境自检。"""
from __future__ import annotations

import json
import os
from pathlib import Path
    ```
  - ADD `src/spine_skin_tool/generation.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0d54ecbfaaa57010336719fdd6e036b1b6afaf78bef32666623e8b9be44eb922`
    ```text
"""单部位生成适配；默认仅预检，云调用无自动重试，输出保留原稿。"""
import base64
import copy
import hashlib
import io
import ipaddress
    ```
  - ADD `src/spine_skin_tool/hair_fit.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7ae236639705732329adb30cde6a5cc43c539e27544ccc6e9a8283b06b8636f8`
    ```text
"""Experimental alpha-only geometry fitting; never edits/cuts a source silhouette."""
import copy,hashlib,io,json
from PIL import Image,ImageChops,ImageDraw
from .design import ROOT,VERSIONS,require,digest
from .assembly import canonical
from .texture import prepare_texture
    ```
  - ADD `src/spine_skin_tool/hair_stages.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0945d04f9c67edbe5b6d3df6b71986f17fed98ad7c4802691c24017b6e253b73`
    ```text
"""Head-first hair measurements. All coordinates are head-local Spine units."""
import math
from PIL import Image
from .design import require


    ```
  - ADD `src/spine_skin_tool/hair_tip.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `b898c82f59cf6779b08124e8d9c18ea9bcd3d90cd76d1d5a9b78c2657bdd2ecf`
    ```text
"""Immutable tip-only edit references and uniform canvas registration."""
import copy,hashlib,json,re,io
from PIL import Image
from .design import require,private_path,digest
from .assembly import canonical,verify_bundle
from .texture import prepare_texture
    ```
  - ADD `src/spine_skin_tool/head_diagnostic.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fa13001d1ca31a21c2836b5017b0d52811ce6ceb4a1366d2122e99b46a75453e`
    ```text
"""Derived head-only inspection for incomplete characters. Never model or approval."""
import json,hashlib
from PIL import Image,ImageDraw
from .design import require,private_path,load_design,digest
from .pipeline_store import read
from .character_flow import source_profile,resolve_bindings
    ```
  - ADD `src/spine_skin_tool/maintenance.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `52197a86b7feaf3d2a2392fc375af57e83d5b28f2722c5b6518ec99f27437550`
    ```text
"""Local source packages and PRIVATE snapshots. Never upload, merge or delete data."""
import contextlib,hashlib,json,os,re,shutil,stat,uuid,zipfile
from pathlib import Path,PurePosixPath
from .assembly import canonical,VERSIONS
from .design import require

    ```
  - ADD `src/spine_skin_tool/mother.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0013df8836e9b58bdc7f8b36582dbeadd1138d3162a1837f4b98577fd0d0e2d1`
    ```text
"""Create a non-destructive runtime copy with source head, ears and expression assets."""
from __future__ import annotations

import copy
import hashlib
import json
    ```
  - ADD `src/spine_skin_tool/photo_design.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e0f96cecb58251de153194cc54e824d17c4f6ebb1154760dbd1855c777cc68c4`
    ```text
"""Photo-to-design contract using the existing read-only subscription vision transport."""
import copy,json,hashlib
from pathlib import Path
from .design import ROOT,VERSIONS,FEATURES,photo_path,digest,keys,require,validate_design
from .assembly import canonical
from .repair_store import atomic
    ```
  - ADD `src/spine_skin_tool/photo_import.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e95843cec71d1cc0352f61ff14ec804da241e9b7e5e55b13121bcf2cff4da842`
    ```text
"""Explicit local photo import; bounded decode, orientation, no source overwrite/upload."""
import hashlib,io,os,uuid
from PIL import Image,ImageOps
from .design import private_path,require,digest
from .pipeline_store import atomic
from .generation import image_bytes,character_references
    ```
  - ADD `src/spine_skin_tool/pipeline.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d7e54070e51a3c791b184102bdd646ce799a27da6f7e368d834eeb0920925cb8`
    ```text
"""One durable photo→design→parts→assembly→review→bounded repair orchestrator."""
import copy,json,re,uuid,subprocess
from pathlib import Path
from .design import ROOT,VERSIONS,require,keys,private_path,photo_path,digest,load_design,freeze_design,required_parts,validate_design
from .assembly import canonical,verify_bundle
from .pipeline_store import directory,read,commit,lease,atomic
    ```
  - ADD `src/spine_skin_tool/pipeline_service.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2413b3ca9011cb94affe5a9a818c399bae4a0c933c739b4232d440aebe7a6456`
    ```text
"""Single UI/CLI pipeline entry, persisted previews, no implicit external calls."""
import json,threading
from pathlib import Path
from .design import ROOT,require,keys,private_path,digest
from .pipeline_store import read,directory,lease,cancel as cancel_flow
from .pipeline import create,advance,edit_design,totals,context,DEFAULTS,retry_unavailable,retry_evidence
    ```
  - ADD `src/spine_skin_tool/pipeline_store.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `38bf2f274d168b084c9aca9c17222382194396634befbb3fd5c473c31c617b63`
    ```text
"""M07 namespace of the existing event/lease store; never a second persistence layer."""
from functools import partial
from . import repair_store
directory=partial(repair_store.directory,kind='flow')
read=partial(repair_store.read,kind='flow')
commit=partial(repair_store.commit,kind='flow')
    ```
  - ADD `src/spine_skin_tool/production_timing.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9d0e45ee3a797a1d7df5c954d0eb50d8067d062dc4f5b16114051c1ef0f3cbb4`
    ```text
"""Actual persisted job/event clocks. Missing historical times remain unknown.

Adoption means incorporated into the selected assembly, NOT visual approval.
"""
import json,math,re
from pathlib import Path
    ```
  - ADD `src/spine_skin_tool/reference_assets.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ae370d0c5b032c021cef58e4485ed0830e30ebdca3da7f68a5bc4e0ca47ec709`
    ```text
"""Private, relocatable licensed reference library; never include it in releases."""
import json, shutil, uuid
from pathlib import Path
from .design import require, digest

EXPORT='ai-city-spineboy-skin-v13/spine-export'
    ```
  - ADD `src/spine_skin_tool/repair.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fad9a9afc7542874c931f3837cb13e3be973acdc0a19bcb81e92f4e0fb161d71`
    ```text
"""Bounded original-photo repair cycles built on shared generation/assembly/review."""
import copy,hashlib,json,time,uuid
from pathlib import Path
from .assembly import canonical,VERSIONS,verify_bundle
from .design import ROOT,private_path,require,load_design,required_parts,digest,keys
from .repair_store import directory,read,commit,lease,cancel,atomic
    ```
  - ADD `src/spine_skin_tool/repair_requests.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8399643374566ea7dcf6d3b9eba304e50072b7fcda43aa1bc1784f0b6e4785bb`
    ```text
"""Immutable original-photo repair requests derived only from existing normative codes."""
import hashlib,json
from pathlib import Path
from .assembly import canonical,VERSIONS
from .design import private_path,require,load_design,part_request,digest
from .review_visual import normative_criteria
    ```
  - ADD `src/spine_skin_tool/repair_service.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7d5cf6457f0ec33fe70beba4f760181c6672d5cbe4ce2aedd2ddf01f4d9c77fb`
    ```text
"""Shared CLI/HTTP repair operations; all live execution is explicit and bounded."""
import json,threading
from pathlib import Path
from .design import ROOT,keys,require,private_path,digest
from .repair_store import directory,read,cancel,lease
from .repair import create,advance,task_report,DEFAULTS
    ```
  - ADD `src/spine_skin_tool/repair_store.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `5a56cf1a117238c074808c41667c8df4acae29031429ff6ba918ffb42b6e4c55`
    ```text
"""Append-only repair state, atomic projections and cross-process owner leases."""
import contextlib,json,os,re,uuid,time
from pathlib import Path
from .assembly import canonical
from .design import private_path,require,digest

    ```
  - ADD `src/spine_skin_tool/review.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `b3f744199d4d5e90a671c0690aad8d235e5ca392ee9c853f79df6d26095477da`
    ```text
"""Evidence-bound quality checks. Structural success never implies semantic approval."""
import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
    ```
  - ADD `src/spine_skin_tool/review_benchmark.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `740d4391486053a7b5d776cf025c7488027431b1f14b30ab6ed6302ebc853e38`
    ```text
"""Normative controlled positives/negatives, blinded held-out characters and real vision scoring."""
import copy,datetime as dt,hashlib,json,math,random,re,shutil,subprocess,uuid
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
from .assembly import canonical,verify_bundle
from .design import ROOT,private_path,require,digest,keys
    ```
  - ADD `src/spine_skin_tool/review_calibration.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d10511321ec86b93945e0cc75e2964dac8b5b2b32af11047a7196f6ccf93a83d`
    ```text
"""Synthetic rule controls and held-out variants, explicitly not semantic goldens."""
import copy,json,uuid
from PIL import Image
from .design import ROOT,private_path
from .assembly import canonical
from .texture import standard_arm
    ```
  - ADD `src/spine_skin_tool/review_render.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `54974f5fa0902bd64a94e588b459c1cb07f0a68f9fb8605d8dff86be9e7f0ce1`
    ```text
"""Read-only variants and genuine Spine browser evidence for a review job."""
import copy,json,os,subprocess
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageOps,ImageFilter
from .assembly import canonical,verify_bundle,VERSIONS
from .design import ROOT,private_path,require,digest,DesignError
    ```
  - ADD `src/spine_skin_tool/review_service.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `96cc93714799efcfeaddf83ea25eeab6e5419c1d261bedcadc1248ac00edfa64`
    ```text
"""Shared HTTP/CLI quality-review operations. No implicit cloud review."""
import hashlib,json,threading
from pathlib import Path
from .design import ROOT,keys,require,private_path,DesignError
from .review import create_review,read_review,review_dir,policy
from .review_render import collect_evidence
    ```
  - ADD `src/spine_skin_tool/review_visual.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `11113658ea45922a24d0f169c17f8c8b9aec704780f03905fe5af05e9970301b`
    ```text
"""Structured, evidence-bound visual assistance using official ChatGPT-auth Codex CLI."""
import copy,datetime as dt,hashlib,json,math,os,subprocess,contextlib
from pathlib import Path
from .design import ROOT,private_path,require,DesignError,required_parts,photo_path,digest
from .assembly import canonical,VERSIONS
from .review import review_dir,read_review,save_report,aggregate,policy,LOCK
    ```
  - ADD `src/spine_skin_tool/standard_ears.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7a25501a52dfd6d1f39ba8a723969fac841ded567070e6b91bb54288dc4e3b22`
    ```text
"""Small reference ears on a frozen hair/head layout; no model or hair resampling."""
import copy,hashlib,json,math
from PIL import Image,ImageChops,ImageDraw,ImageOps
from .assembly import canonical,verify_bundle
from .design import ROOT,private_path,require,digest,load_design
from .hair_fit import target_head
    ```
  - ADD `src/spine_skin_tool/template.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3acf3ce3c893ffa2322305a12d1bf8113bae093bbf94e53e72d78a0f0806cecb`
    ```text
"""只读解析资源引用；不修改骨架或推测几何校准值。"""
import hashlib
import json
from pathlib import Path, PureWindowsPath
import struct

    ```
  - ADD `src/spine_skin_tool/texture.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c43c0fc4dbf4268544bd2470febcf751bbe4bb9bc2d440eb4f183c27ab47e833`
    ```text
"""Chat-validated texture preparation; no source-character silhouette mask."""
from PIL import Image,ImageOps
import re,math

def normalize_texture(image,size,threshold=8):
    image=image.convert('RGBA');original=image.getchannel('A');hist=original.histogram()
    ```
  - ADD `src/spine_skin_tool/texture_compare.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `8c81ad3669e78d70600366d8bc2b93a29896e387898cd230be3c4ff9d232b2a0`
    ```text
"""Read-only visual comparison of rejected edits; never QA admission or refitting."""
import copy,json,shutil,hashlib,uuid
from PIL import Image
from .design import require,digest,private_path
from .assembly import canonical,verify_bundle
from . import texture_edit as edit
    ```
  - ADD `src/spine_skin_tool/texture_edit.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `6ae24e04c727a3c70802dc16ffc86a30306721f658681e2f52211ddb0804fbd6`
    ```text
"""Bounded fixed-base chat revisions; old-outline metrics are diagnostic, never chained."""
import json,uuid,hashlib,shutil
import os
from pathlib import Path
from functools import partial
from PIL import Image,ImageChops
    ```
  - ADD `src/spine_skin_tool/trial_display.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7484cce73e4192abb4ceab702a1e9bab65edd3bf4803ba385d963556734a059a`
    ```text
"""Read-only, candidate-bound display projections; no model or assembly calls."""
import json,re,hashlib
from .design import private_path,require,digest,VERSIONS
from .assembly import verify_bundle,canonical
from .pipeline_store import read

    ```
  - ADD `src/spine_skin_tool/trials.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cda6671a78f1c00219b25406292c5cc7b17e821453848a852f36bf282bb1248b`
    ```text
"""可追溯的本地规格试验；不调用模型，不批准生产规格。"""
import copy
import json
import math
from pathlib import Path
import re
    ```
  - ADD `templates/chibi-4.3-beta/README.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `13e79f1ba498bdd04bf4eabe66287415a39f4059c0c6b14688dae7b962cbf5f0`
  - ADD `templates/chibi-4.3-beta/animation-matrix.yaml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c81d800fd08f46e05ab5d5369a0497045900ab2257c8e57aae8df86fbb6255c6`
    ```text
schema_version: "1.0.0"
template_id: "chibi-4.3-beta"
status: "UNVERIFIED_RENDER_MATRIX"
required_movement:
  - movement/idle-front
  - movement/idle-back
    ```
  - ADD `templates/chibi-4.3-beta/assets.yaml`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e67efa9641d36385b0ffdfe02afe99c02ccf4166b8f7803b757ad8072e27b8d4`
    ```text
schema_version: "1.0.0"
template_id: "chibi-4.3-beta"
profile: "reference_hair_8part_v2"
status: "OBSERVED_REFERENCE_ONLY_NOT_A_PRODUCTION_CONTRACT"
default_size_trial: "runtime/config/size-trials.toml"
# 以下宽高保存历史观测；新试验在 size-trials.toml 中调整，不修改历史。
    ```
  - ADD `templates/chibi-4.3-beta/character-layouts.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ef258ff4e704e1c0d4a979ccce70b463587ea4a7dfe6fdf6ec4964faf90c776f`
    ```text
{
  "status": "EXPERIMENTAL_NOT_PRODUCTION_APPROVED",
  "workflow_revision_source": "runtime/versions.toml [workflow]",
  "units": "Spine units; calibrated on three chat trials, not centimeters",
  "layouts": {
    "short": {
    ```
  - ADD `templates/chibi-4.3-beta/observed-baseline.json`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a93b81a81fa53321ac6f8c455f661f57a05aae499f9d2caa9aac17e5609fe84d`
    ```text
{
  "schema_version": "1.0.0",
  "status": "OBSERVED_INPUT_FACTS_NOT_CALIBRATED",
  "source": "Uploaded files; no live Spine Runtime playback tested",
  "spine_version": "4.3.75-beta",
  "original": {
    ```
  - ADD `tests/integration/check_rebuild.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `da9f3e3f6daf6059404f88fe8d59ec652af407f9798a49f4c3157966b5314e8d`
    ```text
"""显式运行的离线重建验收，真实调用 uv/pnpm，不调用模型。"""
from __future__ import annotations

import hashlib
import json
import os
    ```
  - ADD `tests/test_assembly.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `cee80489fcb9025174b7b554cc48080a26d6186bd87f3e6632763980b0d53fb5`
    ```text
"""合成素材验证装配的真实失败边界；真实母版另由浏览器验收。"""
import copy
import json
from pathlib import Path
import sys
import tempfile
    ```
  - ADD `tests/test_blind_display.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9b475c31f1053760121f9384e846561d36d9e14114c3aa09585d9d5ac78e31ff`
    ```text
"""Synthetic local comparison boundaries. Never calls a subscription model."""
import json,unittest
from unittest.mock import patch
import test_blind_trials
from spine_skin_tool.blind_trials import register,folder
from spine_skin_tool.blind_display import photo,snapshot,returned,part_image
    ```
  - ADD `tests/test_blind_trials.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `63624477c5dd3a58a8ea7306017b8961e33ca1a48192783a0dccc065c4891353`
    ```text
"""Blind admission and durable scope: synthetic images, no subscription calls."""
import json,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import test_pipeline as fixtures
    ```
  - ADD `tests/test_changelog_gate.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `145980f6b5f44d2b85186224e3b4962af4afcb85f17ceb7719c1a0406bd59858`
    ```text
"""Offline, stdlib-only smoke tests for the Codex changelog gate.

Run: python -m unittest discover -s tests -p 'test_*.py' -v
"""
from __future__ import annotations

    ```
  - ADD `tests/test_character_flow.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `aea1d09271dc57de6abcd1ed9417d65d3e9540427384549bf2ea922458d9d17e`
    ```text
"""Shared-flow failure boundaries; no model requests, no private photos in fixtures."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image
import test_generation
from spine_skin_tool.design import (draft_design,freeze_design,load_design,validate_design,
    ```
  - ADD `tests/test_character_session.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `4cee1389001a8752c8a896a095ebe6ddcb0833f32f06141e913ee28314cdb6d6`
    ```text
"""Character conversation isolation and durable bounded sends; no provider traffic."""
import json,tempfile,types,unittest,uuid,re
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool import character_session as cs
    ```
  - ADD `tests/test_coarse_style.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `694da340946dcd0b8cdf88a87cc317f27b7b40f78a2777fc8aff2cc04895eaf8`
    ```text
"""Coarse-style boundaries, uniform margin and bound model feedback; no cloud."""
import json,tempfile,unittest
from pathlib import Path
from PIL import Image,ImageDraw
from spine_skin_tool.generation import build_part_prompt
from spine_skin_tool.repair import route
    ```
  - ADD `tests/test_codex_subscription.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `4038fdc5e53991b6833bb7d900e34edc94933af7423b10fe4481ee38b1b24530`
    ```text
"""Subscription adapter boundary tests: fake CLI, no provider traffic."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
    ```
  - ADD `tests/test_config.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `30c7da801d1e7d3623cb1412673340845eb9fb640ea5986306e6e90ab9b34c0f`
    ```text
"""配置边界与尺寸可调整性的离线回归测试。"""
from __future__ import annotations

import json
from pathlib import Path
import shutil
    ```
  - ADD `tests/test_current_pipeline014.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `af3d34dfd51a7b02f5e1d8b8c14b6b8e8665ed46be572bff9d84e833be2eeb09`
    ```text
"""Current orchestration with injected providers/decisions, not art approval."""
import copy,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import advance
from spine_skin_tool.codex_subscription import SubscriptionError
    ```
  - ADD `tests/test_distribution.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f686f0659aa79f7a116afe89fb38c5a9e3e2d673086bddb38c777e05dc656093`
    ```text
"""Release privacy and portable setup boundaries, no credentials or model calls."""
import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool import distribution as d
from spine_skin_tool.reference_assets import library_root,import_library
    ```
  - ADD `tests/test_ear_timing.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `17657101222f67d0ea454da071996e127b6313a74ad2ae5ee10490761a734df5`
    ```text
"""Synthetic geometry and actual clock arithmetic; no remote calls."""
import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
from PIL import Image,ImageDraw
from spine_skin_tool.ear_geometry import observe,fit_front,coverage
    ```
  - ADD `tests/test_environment.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `5dfb9451244eaa0cf7c021a33e211a836eb3e0c8f97a901f438363c395e6b5df`
    ```text
"""运行环境报告、跨 cwd/编码入口和安装失败边界。"""
from __future__ import annotations

import json
import os
from pathlib import Path
    ```
  - ADD `tests/test_generation.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `31970e926c27736347daee4b118f6c500ee2da4da03fbb680d66a589748eb1c1`
    ```text
"""Provider protocol tests only; fake transport never reaches a vendor or ComfyUI."""
import base64
import copy
import io
import json
import os
    ```
  - ADD `tests/test_hair_ears.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `45f3ee078d325ed3b70f313e56110c3e136b05d04bbc217191475944c75f1309`
    ```text
"""Historical012 hair/ear scope regression; staged013 is in test_head_first."""
import copy,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import create,advance,DEFAULTS
from spine_skin_tool.pipeline_service import report
    ```
  - ADD `tests/test_hair_policy014.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2c194b6014436fcfa0cbcee10e94a2d17b4f8bd7cfda54cd93d4ddde35fca843`
    ```text
"""Semantic boundary controls: visible jaw and independent ear visibility."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image,ImageDraw
from spine_skin_tool.ear_geometry import coverage
    ```
  - ADD `tests/test_hair_tip.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3830eabf4b3f365a3de9a3c6f1329d23555b3e6d6f646bf822f17c4ec2650b35`
    ```text
"""Fixed-base registration preserves fitted geometry; no real image generation."""
import hashlib,json,unittest
from PIL import Image
import test_head_first as legacy_head
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import digest,DesignError
    ```
  - ADD `tests/test_head_first.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `64e87788ed8d7f00764c3fb32ac43a85c1717fe4e2729c8ea46b160cb58b38e2`
    ```text
"""Head-first and fixed-base ear composition boundaries; synthetic, no model calls."""
import copy,json,unittest,io
from unittest.mock import patch
from pathlib import Path
from PIL import Image,ImageDraw
import test_review_integration
    ```
  - ADD `tests/test_live_capacity.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `69852823c4218d45ecf3e35e4b7b759b73e638615d8bc779b51c6e0e2d3b4286`
    ```text
"""Authorized lifetime pool growth retains finite per-job and disabled defaults."""
import json,tempfile,unittest
from pathlib import Path
from spine_skin_tool.generation import defaults,validate_settings
from spine_skin_tool.review_visual import review_settings
from spine_skin_tool.photo_design import settings as design_settings,DEFAULTS
    ```
  - ADD `tests/test_m08_faults.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a0e22fdf47e01fe9f2405e2aba82c0cac3adfc806e82ae0d837abac7e6e6500e`
    ```text
"""Injected ENOSPC/corruption/login/model errors are NOT physical fault evidence."""
import errno,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import advance,edit_design
from spine_skin_tool.pipeline_store import read,directory
    ```
  - ADD `tests/test_m08_judgments.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `60c7d03d81560435a16734c0b0d18127535240266dd5c286cb3149322bd32ebc`
    ```text
"""Synthetic reference labels/attestations are not real approvals or reliability."""
import copy,json,unittest
from pathlib import Path
from unittest.mock import patch
import test_blind_trials as fixtures
from spine_skin_tool.blind_trials import register,adjudicate,metrics
    ```
  - ADD `tests/test_maintenance.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fb192ec7194cb2ac6b689e410a07123f83cc7af359a59a5fd247af8dcad33811`
    ```text
"""Private synthetic files only; never backup real photos or delete real data."""
import copy,errno,json,stat,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.maintenance import create_archive,verify_archive,restore_archive,fingerprint
from spine_skin_tool.assembly import canonical,VERSIONS
    ```
  - ADD `tests/test_photo_design.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `0055beff2b879585bd6552eced5a4c2795bcb237c361d8a98c3004603445e36e`
    ```text
"""Photo design schema, original-only transport and budget/recovery boundaries."""
import copy,json,subprocess,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image,ImageDraw
from spine_skin_tool.design import draft_design,DesignError,digest
    ```
  - ADD `tests/test_photo_import.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9e61cb054d7094b65f4f3eecbd82716be8ae6505d4e6fceffce7ceb628222c77`
    ```text
"""User-selected import guards, deduplication, metadata and concurrent publication."""
import io,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from spine_skin_tool.photo_import import import_photo,MAX_BYTES
    ```
  - ADD `tests/test_pipeline.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `6de3f5331837fd9d02f0049a7801290fa216adcc019ee3ef9fb3e433129a0bb1`
    ```text
"""Durable pipeline boundaries with synthetic photos/fake models, never live calls."""
import copy,io,json,unittest,os,subprocess,sys
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import test_review_integration
    ```
  - ADD `tests/test_repair.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `55b52ca80fb6f0d6952defa7fea15ce5e3dc7433bfdaa36d4a11f4b244421a88`
    ```text
"""Durable repair/failure tests. Synthetic input images and fake providers only."""
import copy,io,json,unittest,os,subprocess,sys
from unittest.mock import patch
from pathlib import Path
from PIL import Image
import test_review_integration
    ```
  - ADD `tests/test_review.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `6db460b8267f2e629f55d4bab67223799472cd4eb95f8bd7e6ba9e48082a92d6`
    ```text
"""QA defects and false-approval boundaries. No model/HTTP calls."""
import copy,hashlib,json,subprocess,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool.assembly import canonical
    ```
  - ADD `tests/test_review_benchmark.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d81d1b960ff166c0665e9e2c250335eb68d8d39f333793d3a1638469e007cac4`
    ```text
"""Calibration honesty, isolation and persistent-call failure boundaries; never cloud calls."""
import copy,hashlib,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import DesignError
    ```
  - ADD `tests/test_review_integration.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `c8689ffcd80fe9e4f3abcd9c6f9aac3012e6cea193c8a566b28d5f86e862f484`
    ```text
"""Real bundle integrity defects on synthetic inputs, never real photos or cloud calls."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool.design import ROOT,draft_design,freeze_design,digest,DesignError
    ```
  - ADD `tests/test_standard_ears.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fb68511ce0b31bc8c26678fc4071a704349800ad4b7d8e20d8e3ababb74f9471`
    ```text
"""Visible-ear policy and zero-model fixed-base augmentation, synthetic photos only."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image,ImageChops,ImageDraw
import test_head_first as fixtures
from spine_skin_tool import ear_policy,standard_ears
    ```
  - ADD `tests/test_template.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `a2ab75500f87c76132c7d5f343710c87323cbd50a59373036e155aacb8d0a60f`
    ```text
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
    ```
  - ADD `tests/test_texture.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `68cd3c966163a6c84811540c483f054cfbebcbd32730ccb1212850c43b26c2f9`
    ```text
import unittest
from PIL import Image
from spine_skin_tool.texture import normalize_texture,standard_arm

class TextureTests(unittest.TestCase):
    def test_nearly_transparent_outlier_does_not_shrink_main_leg(self):
    ```
  - ADD `tests/test_texture_compare.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `6a700ddd6798fff6e9b60a5cbcae7fa11129f7b473f0816832fe317cbd27f38c`
    ```text
"""Synthetic geometry/state/security boundaries for read-only comparison."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image
import test_texture_edit as fixtures
from spine_skin_tool import texture_compare as compare,texture_edit as edit
    ```
  - ADD `tests/test_texture_edit.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `46d8fbfba4b59ac54f01ed1f7d6109102dca569526b31fca686cfd3b0b7d9a36`
    ```text
"""Synthetic texture-only boundary tests. No real photos, model or image edits."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool import texture_edit as edit
    ```
  - ADD `tests/test_trial_display.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `85a3b866149f8e66c42d7bebd7f2350150ae024db4503f4ab64d7303c33cc60b`
    ```text
"""Synthetic persisted flows: display provenance, no live calls or private photos."""
import json,unittest,copy
from unittest.mock import patch
import test_hair_ears as fixtures
from spine_skin_tool.pipeline import create,advance,DEFAULTS
from spine_skin_tool.trial_display import snapshot,texture,job_texture,batch
    ```
  - ADD `tests/test_trials.py`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `bd7109f23f09cb0df8bd5bf25eb2750b405af2d6d3f14c126da33f6bff54c9ec`
    ```text
"""规格试验的真实图像/资源与拒绝边界。"""
import copy
import json
import unittest
import shutil
from PIL import Image
    ```
  - ADD `ui/acceptance.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `05777f84d52ff5d6ae7201e9a688ebb2f27a290492de30ab68e7556e240dd770`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>検証と配布の門</title>
<style>body{font:16px/1.7 system-ui;background:#17232e;color:#edf3f6;max-width:1060px;padding:24px;margin:auto}h1{font-size:26px}a{color:#a4d9f7}button{font:inherit;background:#29495b;color:inherit;border:1px solid #7795a8;border-radius:6px;padding:8px 16px}section,.notice{background:#243b49;border:1px solid #587484;border-radius:8px;padding:16px;margin:16px 0}section h2{font-size:18px;margin:0 0 6px}.PASS{border-left:5px solid #9bd5a9}.FAIL{border-left:5px solid #ffaaa0}.STALE,.PARTIAL{border-left:5px solid #f2cd83}.status{font-weight:bold}.small{font-size:13px;color:#c2d1dc;overflow-wrap:anywhere}dl{display:flex;flex-wrap:wrap;gap:8px 22px}dt{color:#bfd0d9}dd{margin:0}#error{color:#ffc0a6}[hidden]{display:none!important}</style>
<h1>M08：検証と配布の門</h1><p><a href="/hair-trials?batch=retest011">三例の髪の試行</a> ／ <a href="/characters">キャラクター制作</a></p>
<p class="notice">本番配布：未承認。3枚の調整済み写真、保存素材の再生、コードテストだけでは、未見写真の全身制作を承認しません。サイズ・美術・素材の再配布許諾も別の確認項目です。</p>
<p>開発用ソースZIPには写真・鍵・生成物・依存物・原参考素材を含めません。私用バックアップは写真と作業記録を含むため共有用ではありません。復元は新規ディレクトリだけに行い、自動生成は再開しません。</p>
<button id="reload">検証記録を再読込</button><p id="status" role="status">読み込み中…</p><p id="error" role="alert" hidden></p><main id="gates"></main><div id="blind"></div><p class="small" id="pin"></p>
    ```
  - ADD `ui/acceptance.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e44b968d356649433ebc70a4ddd8fbe2990e7904773f4361e176caa85419058d`
    ```text
/* Only GET saved, hash-bound acceptance facts. No model/archive/resume actions. */
(async()=>{
 const $=id=>document.getElementById(id),states={PASS:'この範囲は検証済み',FAIL:'不合格',PARTIAL:'一部のみ検証',NOT_VALIDATED:'未検証',STALE:'証拠の再確認が必要',USER_ATTESTED:'ユーザーが証拠を申告・機械検証とは区別'};
 const labels={tests:'テスト数',seconds:'実行秒数',files:'ファイル数',bytes:'バイト数',characters:'キャラクター数',frames_per_character:'各キャラクターのフレーム数',scales:'倍率',new_model_calls:'新規モデル呼出し',verified:'ファイル整合性',credentials_restored:'認証情報の復元',live_resume_allowed:'自動生成の再開',batches:'登録バッチ数',completed_cases:'処理終了ケース数'};
 function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
 function blindCard(b){const s=document.createElement('section'),status={PLANNED:'未実行',RUNNING:'実行中',REQUIRES_REVIEW:'確認待ち',STALE:'再検証が必要',WAIT_RESULT:'結果待ち',INTERRUPTED:'中断',OUTPUT_BLOCKED:'サービス停止',CONFIGURATION_BLOCKED:'設定確認待ち',ERROR_OR_RESULT_UNKNOWN:'実行結果未確認',LIMIT_REACHED:'上限到達',CANCELLED:'中止'};s.append(text('h2',b.scope==='EXPLICIT_USER_RETEST_NOT_BLIND'?'既存写真の明示再試行（盲検と区別）':b.status==='STALE'?'未調整写真の記録・再検証待ち':'未調整写真の登録記録'),text('p','処理終了：'+b.completed_cases+'例。誤り率は人の正解ラベル付き補助チェックだけを集計し、本番承認率とは区別します。'));const ul=document.createElement('ul'),rate=v=>typeof v==='number'?(100*v).toFixed(1)+'%':'未計測';for(const c of b.cases||[])ul.append(text('li',`ケース${c.case}：${status[c.status]||'未確認'} ／ 画像要求 ${c.image_requests}・返却PNG ${c.returned_images} ／ 参照ラベル ${c.labeled_checks||0} ／ 補助誤許可率 ${rate(c.false_accept_rate)} ／ 見逃し率 ${rate(c.missed_defect_rate)} ／ 誤棄却率 ${rate(c.false_reject_rate)} ／ 古いラベル ${c.stale_labels||0}`));s.append(ul);return s;}
    ```
  - ADD `ui/blind-trials.html`; location `initial clean source import`; lines `1-4`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `063cb828f00e949401653465ee1b4488922e5ac6354c73750da56d0b0daf6234`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未調整写真・制作比較</title>
<style>body{font:16px/1.6 system-ui;background:#17242d;color:#e6f1f6;max-width:1500px;margin:24px auto;padding:0 20px}a{color:#a8dcff}section{border:1px solid #527080;border-radius:8px;padding:20px;margin:20px 0}.pair{display:grid;grid-template-columns:minmax(200px,1fr) minmax(350px,2fr);gap:20px}img{width:100%;max-height:560px;object-fit:contain;background:#263b48}iframe{width:100%;height:560px;border:1px solid #527080}.partial-part{display:inline-block;width:42%;vertical-align:top;margin:8px}.partial-part img{height:180px;object-fit:contain}select,button{padding:8px;margin:8px}small{overflow-wrap:anywhere}.error{color:#ffb3ac}li{overflow-wrap:anywhere}@media(max-width:800px){.pair{grid-template-columns:1fr}iframe{height:620px}}</style>
<style>.pair>div{min-width:0}iframe{box-sizing:border-box}select{max-width:calc(100% - 16px)}@media(max-width:800px){.pair{grid-template-columns:minmax(0,1fr)}}</style>
<h1>未調整写真と生成キャラクターの比較</h1><p><a href="/acceptance">M08の検証記録</a> ／ <a href="/characters">制作一覧</a></p><p>左：この作業で実際に使用した原写真。右：選択した固定候補。技術的な再生・AIの補助判断は、美術や本番利用の承認とは区別します。写真はローカル比較用です。</p><button id="reload">保存結果を再読込</button><p id="status" role="status"></p><main id="cases"></main><script src="/timing.js"></script><script src="/blind-trials.js"></script></html>
    ```
  - ADD `ui/blind-trials.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `9e091a2a19f18a48cee1d893a5849f4e0a0bf21d2d309f08384e5e7a565d640f`
    ```text
/* GET only. Original photos are bound to the frozen batch and exact SHA. */
(async()=>{
 const $=id=>document.getElementById(id),batch=new URLSearchParams(location.search).get('batch'),selected=new Map(),views=new Map();
 const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 const states={PLANNED:'未実行',RUNNING:'実行中',INTERRUPTED:'中断',REQUIRES_REVIEW:'確認待ち',FAIL:'不合格',UNKNOWN:'未確認',PASS:'補助判定：適合',NOT_RUN:'未実行',NOT_APPLICABLE:'対象外',ERROR:'取得失敗',STALE:'証拠の再確認が必要',LIMIT_REACHED:'上限到達',WAIT_RESULT:'結果待ち',OUTPUT_BLOCKED:'サービスが出力を停止',CONFIGURATION_BLOCKED:'設定確認待ち',ERROR_OR_RESULT_UNKNOWN:'実行結果未確認'};
 const names={hair_fit:'頭髪の適合',hair_consistency:'前後の髪の一致',ear_visibility:'小耳',style:'画風の大分類',clothing:'衣服',garment_parts:'衣服の部品構造',material_outlines:'素材別の輪郭線',leg_connections:'脚の接続',arm_style:'腕',leg_style:'脚',layer_order:'重なり順',skirt_occlusion:'裙と脚'};
    ```
  - ADD `ui/calibration.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7ca7f6cb9b497247dae2ea04199a8cbd0e90ce81e97db6d01ab0084695379eb4`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><title>品質レビューの校正</title>
<style>body{background:#18232d;color:#eef;font:15px system-ui;margin:24px}a{color:#9de}button,select{padding:9px;margin:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse}td,th{padding:10px;border:1px solid #627482}article{padding:14px;margin:15px 0;border:1px solid #627482}article img{max-width:100%;width:850px}.bad{color:#ffb9a5}</style>
<h1>既存仕様によるレビュー校正</h1><p>Harri の部品構造と Davide / Spineboy の描画規則を判定基準にしています。既定の仕様を再承認する必要はありません。</p>
<p>対照画像は私有のテスト用コピーです。元のキャラクターは変更されません。各「基準内」は指定した一項目だけを指し、全身の品質合格ではありません。自動美術合格は無効です。</p>
<p><a href="/reviews">レビューへ戻る</a></p><select id="benchmarks"></select><button id="load">保存した結果を表示</button><pre id="status" role="status">読み込み中…</pre>
<table><thead><tr><th>集合</th><th>検査</th><th>件数</th><th>違反検出</th><th>正常判定</th><th>誤検出</th><th>見逃し</th><th>未確認・低確信</th></tr></thead><tbody id="summary"></tbody></table>
    ```
  - ADD `ui/calibration.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `fad6a97e954717842197f583b2dc67b8954441dbeed74930a3c50d718f4d537a`
    ```text
(async()=>{
 const $=id=>document.getElementById(id),label={PASS:'基準内',FAIL:'違反',UNKNOWN:'未確認',COMPLETE:'テスト完了',PARTIAL:'未完了',REQUIRES_REVIEW:'手動確認を維持',LIMITED_CONTROLLED_TEST_PASS_ADVISORY_ONLY:'限定対照テスト内で一致（補助のみ）'};
 async function show(){
  const id=$('benchmarks').value;if(!id)return;const response=await fetch('/review/calibration/'+encodeURIComponent(id));if(!response.ok)throw Error('元データ・仕様・証拠の整合性を確認できません。');const r=await response.json();
  $('status').textContent=`${label[r.status]} ／ ${label[r.model_release_decision]}\n実行予約：${r.calls.length} 回 ／ 自動美術合格：無効\n判定基準：既存の制作仕様。写真の同一性・自然な失敗分布全体は今回の測定対象外です。`;
  $('report').textContent=JSON.stringify(r,null,2);$('summary').replaceChildren();$('cases').replaceChildren();
    ```
  - ADD `ui/character-flow.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `186dcd5683aa7fda104846beca33b25149b25861d875528758bd2d9de719e55d`
    ```text
/* Shared experimental design and full-character operations; never auto-generates. */
(async()=>{
 const $=id=>document.getElementById(id);let identity=null;
 const api=async(action,payload)=>{
  const response=await fetch('/character/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error((data.code||'')+' '+(data.message||'操作に失敗しました。'));return data;
    ```
  - ADD `ui/hair-trials.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f482033f5ed8919a67c69109f6fb461470d1d7a2d8d2447465de7e1e307dd988`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>髪と小耳の試行比較</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{font:15px/1.6 system-ui;background:#17232e;color:#ecf1f5;max-width:1440px;margin:24px auto;padding:0 22px}h1{font-size:25px;margin-bottom:8px}h2{font-size:19px}h3{font-size:16px}a{color:#a8dcff}button,select,input{font:inherit}button,select{padding:7px 12px;background:#253e50;color:inherit;border:1px solid #637f91;border-radius:6px}button:disabled{opacity:.45}button,a{touch-action:manipulation}button{cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}nav a{padding:9px 16px;background:#253c4e;border:1px solid #4a6578;border-radius:8px;text-decoration:none}nav a[aria-current]{background:#285c71;border-color:#90d3e7}.muted{color:#b5c4cf}.note{padding:12px 16px;background:#233744;border-radius:8px}.layout{display:grid;grid-template-columns:215px minmax(0,1fr);gap:22px;margin-top:20px}#history{display:flex;flex-direction:column;gap:9px;align-self:start}#history button{text-align:left;padding:12px;white-space:pre-line}#history button[aria-current]{border:2px solid #a5e1e8;background:#294e5d}.card{background:#213440;border:1px solid #496575;border-radius:10px;padding:18px;margin-bottom:18px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.pair>div{min-width:0}.viewport{position:relative;aspect-ratio:1;background:#33434f;border-radius:6px;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}.veil{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#33434f;color:#cbdce7;text-align:center;padding:20px}.viewport.ready .veil{display:none}.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}.controls input{width:190px}figure{margin:0}.raw{background-color:#ccd5dd;background-image:linear-gradient(45deg,#a8b5c0 25%,transparent 25%),linear-gradient(-45deg,#a8b5c0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#a8b5c0 75%),linear-gradient(-45deg,transparent 75%,#a8b5c0 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0;display:block;border-radius:6px}.raw img{width:100%;height:270px;object-fit:contain;display:block}.raw:hover{outline:2px solid #a5e1e8}.PASS{color:#a6e0b8}.FAIL{color:#ffacaa}.UNKNOWN{color:#efd18d}li{margin:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:15px}summary{cursor:pointer}#loading[hidden],#content[hidden],#error[hidden],#empty[hidden]{display:none}#error{color:#ffc1ae}#error:not([hidden]){border:1px solid #b97262;padding:16px}#status{white-space:pre-line}#binding{font-size:13px;overflow-wrap:anywhere}dialog{max-width:95vw;max-height:95vh;background:#233744;color:inherit;border:1px solid #85a8bb;border-radius:10px}dialog img{max-width:85vw;max-height:78vh;object-fit:contain;display:block}dialog::backdrop{background:#000b}.inline{display:flex;justify-content:space-between;align-items:center;gap:12px}#checks{padding-left:22px}@media(max-width:850px){.layout{grid-template-columns:1fr}#history{flex-direction:row;overflow:auto}#history button{min-width:180px}.pair{gap:10px}body{padding:0 12px}.controls input{width:140px}.raw img{height:200px}}
</style>
<style>[hidden]{display:none!important}</style>
<h1 id="title">髪と小耳の試行比較</h1>
    ```
  - ADD `ui/hair-trials.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `ccb97ad2d4fd7e9ab0630d002ad13827804c2fbdc2883b0f7e6a3f713dc2d7dd`
    ```text
/* Read-only candidate-bound display. Never generate, assemble or approve. */
(async()=>{
 const $=id=>document.getElementById(id),q=new URLSearchParams(location.search);
 const valid=id=>/^flow-[a-f0-9]{32}$/.test(id||''),parts={HAIR_FRONT:'前髪・小耳',HAIR_BACK:'後髪'};
 const states={RUNNING:'実行中',PLANNED:'準備済み',REQUIRES_REVIEW:'最終確認待ち',STALE:'規約更新前の履歴',ERROR_OR_RESULT_UNKNOWN:'実行エラー・結果未確認',OUTPUT_BLOCKED:'サービスが生成を停止',CONFIGURATION_BLOCKED:'設定の確認待ち',WAIT_RESULT:'送信済みの結果待ち',INTERRUPTED:'中断',CANCELLED:'中止'};
 const verdicts={FAIL:'補助チェックで不合格',UNKNOWN:'補助チェック未確認',ADVISORY_PASS_NOT_APPROVED:'髪の補助チェック通過・最終承認ではありません'};
    ```
  - ADD `ui/index.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `e07b1a530e10ebc6cc042bca632bfae0afcb04a51be1bfe18717141c527a540b`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><title>Spine キャラクタープレビュー</title>
<style>body{font:16px system-ui;background:#18232d;color:#eef;margin:24px}canvas{background:#33434f;border:1px solid #789;max-width:100%;height:auto;box-sizing:border-box}select,button{padding:8px;margin:8px;max-width:100%}pre{white-space:pre-wrap}</style>
<style>body.comparison{margin:10px}body.comparison h1{font-size:16px}body.comparison>p,body.comparison>label,body.comparison>button,body.comparison>br{display:none}body.comparison canvas{width:100%;max-width:512px}body.comparison pre{font-size:12px}</style>
<style>body.embedded{margin:0;background:#33434f}body.embedded h1,body.embedded pre{display:none}body.embedded canvas{display:block;border:0}</style>
<h1>Spine キャラクタープレビュー</h1><p>生成素材・参照素材のローカル再生用です。再生成功は美術品質の合格を示すものではありません。</p>
<p><a href="/characters">写真からキャラクターを制作・保存作業を表示</a></p>
    ```
  - ADD `ui/orientation.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3565723247a2be02ca47ee7f9b7321ef0158b6bc85878ed468e9b9c94f7e780b`
    ```text
/* Restore fixed ears after animation application; apply direction-specific occlusion. */
globalThis.applySpineOrientation=function(rig,direction,policy){
 if(!policy||rig.skin?.name!==policy.skin)return;
 if(!policy.front_order&&direction!=='back')return;
 if(direction==='back'){
  for(const name of [...policy.face_slots,...(policy.back_hide_slots||[])])rig.findSlot(name)?.pose.setAttachment(null);
    ```
  - ADD `ui/pipeline.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1c3d61a17c77c1e17b7203fe6a8c427031b857ce91a997ede020078fe76ba7a1`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><title>写真からキャラクター制作</title>
<style>body{font:15px system-ui;background:#18232d;color:#eef;margin:24px}a{color:#9de}input,select,button,textarea{padding:8px;margin:6px}textarea{display:block;width:min(96%,950px);background:#223442;color:#eef}pre{white-space:pre-wrap;overflow-wrap:anywhere}iframe{width:590px;height:1000px;border:1px solid #789;max-width:95%}#previews{display:flex;gap:16px;flex-wrap:wrap}fieldset{margin:15px 0}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #789}</style>
<h1>写真からキャラクター制作</h1>
<p>元写真から設計・全部位・全身構築・動作レビュー・有限返修を順番に実行します。頭・表情は原素材、耳は髪と一緒に小さく生成し、原耳は常に非表示です。腕は標準形状の配色です。判断が不確かな候補は「確認待ち」として保存します。</p>
<p><a href="/reviews">レビュー</a> ／ <a href="/repairs">返修作業</a> ／ <a href="/trials">詳細な素材試験</a></p>
<fieldset id="settings"><legend>新しい制作</legend>
    ```
  - ADD `ui/pipeline.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `130404d955514969e20c2d4ec7b6320a78edbd7cc94b03705cecceedf11a076f`
    ```text
(async()=>{
 const $=id=>document.getElementById(id),names={PLANNED:'計画保存済み',RUNNING:'制作中',INTERRUPTED:'中断・復旧可能（外部要求は再送しません）',DESIGN_READY:'設計の確認が必要です',CONFIGURATION_BLOCKED:'利用設定・残り試験上限を確認してください',WAIT_RESULT:'送信済みの結果を確認中・自動再送なし',ERROR_OR_RESULT_UNKNOWN:'エラー・結果未確認',OUTPUT_BLOCKED:'サービスが処理を拒否しました・自動再試行なし',STALE:'元資料または仕様が変更されました',CANCELLED:'後続処理を停止しました',REQUIRES_REVIEW:'美術・不確かな項目の確認待ち',READY_FOR_REVIEWED_EXPORT:'全項目のレビュー記録がある候補'};let id=null,timer=null,config;
 async function api(action,data){const r=await fetch('/flow/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),v=await r.json();if(!r.ok)throw Error(v.code+'：'+v.message);return v;}
 let epoch=0;
 async function safe(fn){const revision=epoch;try{await fn();}catch(e){if(revision===epoch){$('status').textContent=e.message;if(!id)$('settings').disabled=false;}}}
 async function list(revision=epoch){const received=await(await fetch('/flow/config')).json();if(revision!==epoch)return;config=received;$('photo').replaceChildren(...config.photos.map(p=>new Option(p,p)));$('source').replaceChildren(...config.sources.map(s=>new Option(s.character_id+' / '+s.output,s.output)));$('tasks').replaceChildren(...config.tasks.map(t=>new Option((names[t.status]||t.status)+' / '+t.character_id+' / '+t.id,t.id)));if(id)$('tasks').value=id;$('budgets').textContent=Object.entries(config.budgets).map(([k,b])=>({design:'写真設計',image:'画像生成',visual:'補助レビュー'}[k]+`：予約 ${b.reserved}/${b.max_calls}、残り ${b.remaining}、${b.enabled?'設定有効':'設定無効'}`)).join('\n');}
    ```
  - ADD `ui/repair.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7b03d9870b4351ec3cda87c934f716749f72f011ef11eea92fc5acbf2534128c`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><title>返修・復旧</title>
<style>body{font:15px system-ui;background:#18232d;color:#eef;margin:24px}a{color:#9de}input,select,button{padding:8px;margin:7px}pre{white-space:pre-wrap;overflow-wrap:anywhere}iframe{width:590px;height:1000px;border:1px solid #789;max-width:95%}.previews{display:flex;gap:16px;flex-wrap:wrap}li{margin:10px 0}</style>
<h1>有限返修と作業復旧</h1><p>既存の制作仕様を守り、確定した構造エラーを再構築します。内容の再生成は元写真・元参考だけを使います。モデルの補助判定だけでは美術合格になりません。</p>
<p><a href="/reviews">レビューへ</a> ／ <a href="/calibration">仕様の対照テストへ</a></p>
<label>現在の政策による元レビュー<select id="source"></select></label><br>
<label>最大サイクル<input id="cycles" type="number" min="1" max="3" value="3"></label><label>画像呼出し総上限<input id="images" type="number" min="1" max="18" value="6"></label><label>部位ごとの上限<input id="perpart" type="number" min="1" max="3" value="3"></label><label>補助レビュー上限<input id="visions" type="number" min="1" max="3" value="3"></label><br>
    ```
  - ADD `ui/repair.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1c6dca2cfe215df47f0ea9a173f78121ea7aedb638da8cdb0deb843282c43e57`
    ```text
(async()=>{
 const $=id=>document.getElementById(id),names={INTERRUPTED:'処理が中断されています（復旧可能・自動再送なし）',CONFIGURATION_BLOCKED:'利用設定・全体予算を確認してください（未送信）',OUTPUT_BLOCKED:'外部処理が拒否しました（自動再試行なし）',PLANNED:'計画保存済み',RUNNING:'処理中',REQUIRES_REVIEW:'手動確認待ち',READY_FOR_REVIEWED_EXPORT:'レビュー済みの候補',ERROR_OR_RESULT_UNKNOWN:'エラー・結果未確認',WAIT_RESULT:'送信済み結果の確認待ち（再送なし）',CANCELLED:'後続処理を停止',STALE:'元資料・政策が変更されました',LIMIT_REACHED:'試験上限に達しました',LIVE_DISABLED:'再生成は無効です',REASSEMBLE:'共通装配で再構築',STANDARD_ARM:'標準腕を再配色（非AI）',REGENERATE:'元写真から新規生成'};let id=null,timer=null,ticks=0;
 async function api(action,data){const r=await fetch('/repair/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),v=await r.json();if(!r.ok)throw Error(v.code+'：'+v.message);return v;}
 async function list(){const r=await fetch('/repair/config');if(!r.ok)throw Error('設定・保存状態を確認してください。');const c=await r.json();$('source').replaceChildren(...c.reviews.map(r=>new Option(r.character_id+' / '+r.review_id,r.review_id)));$('tasks').replaceChildren(...c.tasks.map(t=>new Option((names[t.status]||t.status)+' / '+t.id,t.id)));if(id)$('tasks').value=id;}
 function show(s){id=s.id;$('tasks').value=id;$('report').textContent=JSON.stringify(s,null,2);$('status').textContent=`${names[s.status]||s.status} ／ 段階：${s.phase}\n画像予約：${s.image_calls_reserved}/${s.limits.max_image_calls}、補助レビュー予約：${s.visual_calls_reserved}/${s.limits.max_visual_calls}\n候補品質：${s.quality_approved?'全項目の確認記録あり':'未承認・実験用'} ／ 生産承認：なし`+(s.error_code?'\n'+s.error_code:'')+(s.cancel_requested?'\n停止要求を保存済みです。':'');
  for(const [input,key] of [['cycles','max_cycles'],['images','max_image_calls'],['perpart','max_calls_per_part'],['visions','max_visual_calls']]){$(input).value=s.limits[key];$(input).disabled=true;}
    ```
  - ADD `ui/review.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `d2eff22cd7f54979c54e0e560f40d6d327abe7cec6e7e1098c4717ef3fa849b3`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><link rel="icon" href="data:,"><title>キャラクター品質レビュー</title>
<style>body{background:#18232d;color:#eef;font:15px system-ui;margin:24px}button,input,select,textarea{padding:8px;margin:6px;max-width:95%}a{color:#9de}pre{white-space:pre-wrap;overflow-wrap:anywhere}textarea{width:min(96%,1050px)}.images{display:flex;gap:16px;flex-wrap:wrap}.images img{width:min(100%,700px);height:auto}.bad{color:#ffb9a5}label{display:inline-block}li{margin:8px 0}</style>
<h1>キャラクター品質レビュー</h1><p>ファイル・動作ルールと、美術上の確認を分けて記録します。現在の自動視覚判定は未校正です。モデルが問題なしと答えても自動合格にはなりません。</p>
<p><a href="/trials#character-flow">設計・全身構築へ戻る</a> ／ <a href="/calibration">既存仕様による校正・対照テスト</a> ／ <a href="/repairs">有限返修・復旧</a></p>
<label>構築済みキャラクター<select id="characters"></select></label><button id="choose">保存先を選択</button><br>
<label>保存先<input id="output" style="width:650px" placeholder="runtime/work/.../character-output"></label><button id="create">ローカル検査を開始</button>
    ```
  - ADD `ui/review.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f66c5f582c9d4d5cb6d71edf9a1f14f8e5c9fbebcf21cec3329444ed490a53fd`
    ```text
(async()=>{
 const $=id=>document.getElementById(id);let identity=null,timer=null,settings={};
 const names={PASS:'確認済み',FAIL:'不合格',UNKNOWN:'未確認',REQUIRES_REVIEW:'手動確認待ち',RUNNING:'処理中',NOT_RUN:'未実行',ERROR:'収集エラー',COMPLETED_ADVISORY:'補助結果を受信',ERROR_OR_RESULT_UNKNOWN_NO_RETRY:'結果未確認（自動再試行なし）'};
 const api=async(action,payload)=>{const r=await fetch('/review/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error((d.code||'')+' '+(d.message||'確認できませんでした。'));return d;};
 async function refresh(){const response=await fetch('/review/config'),c=await response.json();if(!response.ok)throw Error(c.message||'レビュー設定を確認してください。');settings=c.visual_settings;$('gate').textContent=!settings.live_enabled||!settings.upload_consent?'補助レビューは無効です。送信せず入力を確認できます。':settings.remaining_calls===0?'設定された試験回数に達しました。自動再試行は行いません。':'購読枠を使用します。残量は確認できません。設定した呼出し上限内でのみ実行します。';$('characters').replaceChildren(...c.characters.map(x=>new Option(x.character_id+' / '+x.output,x.output)));$('reviews').replaceChildren(...c.reviews.map(x=>new Option(x.character_id+' / '+(names[x.status]||x.status)+' / '+x.review_id,x.review_id)));return c;}
 function show(r){identity=r.review_id;$('reviews').value=identity;$('report').textContent=JSON.stringify(r,null,2);
    ```
  - ADD `ui/texture-compare.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `38ddf710af2fc4dd6b19fb1f120cbe0b8d355e3c125b90a84b549340db7dd68d`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>髪素材の変更比較</title>
<style>
*{box-sizing:border-box}body{margin:24px auto;padding:0 20px;max-width:1320px;background:#14232c;color:#e5edf1;font:15px system-ui}h1{font-size:26px}h2{font-size:20px}a{color:#8de4df}button,select,input{font:inherit}button,select{padding:8px;background:#304653;color:inherit;border:1px solid #718e9d;border-radius:6px}button{cursor:pointer}label{display:inline-flex;gap:8px;align-items:center;margin:5px 12px 5px 0}.note{border-left:4px solid #e4be70;padding:12px 16px;background:#293a43;line-height:1.7}.controls{padding:12px 0;display:flex;flex-wrap:wrap;gap:6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{background:#22343f;border:1px solid #4b6573;border-radius:8px;padding:12px;min-width:0}iframe{width:100%;height:610px;border:0;background:#18232d}.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.tile{padding:10px;border:1px solid #617884;border-radius:8px;background:#243845}.tile.selected{border:2px solid #8de4df}.checker{background-color:#74868c;background-image:linear-gradient(45deg,#62757d 25%,transparent 25%),linear-gradient(-45deg,#62757d 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#62757d 75%),linear-gradient(-45deg,transparent 75%,#62757d 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.tile img{display:block;width:100%;height:235px;object-fit:contain;cursor:pointer}.tile p{font-size:12px;min-height:3em}.compareCanvas{width:100%;height:auto;max-height:560px;object-fit:contain}.caption{color:#bbd0da;font-size:13px}#status{white-space:pre-wrap}section{margin:28px 0}#progress{color:#c1eee3}button:disabled{opacity:.5;cursor:wait}@media(max-width:750px){.pair{grid-template-columns:1fr}.gallery{grid-template-columns:1fr 1fr}.tile img{height:190px}body{padding:0 12px}iframe{height:590px}}
</style>
<h1>髪素材の変更比較</h1>
<p class="note">原素材と前髪・後ろ髪の各3回の編集結果です。<strong>すべて比較専用・未承認</strong>です。過去の実験指標による拒否は変更していません。IoUは編集前後の輪郭一致度で、頭部の覆い方や美術品質の合否ではありません。新しい生成や自動採用は行いません。</p>
    ```
  - ADD `ui/texture-compare.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `3390b9db1d094ab367a9a59ff51fa3d3d6f7e415c0046da4d8a12f452df0c9e7`
    ```text
/* Read-only comparison. Existing rejected assets never enter the QA pipeline. */
(async()=>{
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),id=params.get('session');
 const images={},state={ready:false,playing:false,time:0,camera:null,request:0,frames:null};let config;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function loadFrame(frame,url){const started=Date.now();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('プレビューの読み込みがタイムアウトしました。')),60000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.src=url;});while(!frame.contentWindow.preview?.ready){if(frame.contentWindow.preview?.error)throw Error(frame.contentWindow.preview.error);if(Date.now()-started>60000)throw Error('プレビューの準備に時間がかかっています。');await sleep(50);}return frame.contentWindow.preview;}
    ```
  - ADD `ui/timing.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `1b1afcde2ab368618089ad0c57022f3bad9e614e5bdb3018b728ce27d220c033`
    ```text
/* Shared read-only presentation. Physical incorporation is never quality approval. */
window.renderProductionTiming=(container,value)=>{
 container.replaceChildren();if(!value){container.textContent='計時記録は未確認です。';return;}
 const text=(tag,v)=>{const e=document.createElement(tag);e.textContent=v;return e;},seconds=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(1)+' 秒':'未計測';
 container.append(text('h3','実測時間（この候補）'),text('p','写真を今回の制作へ送信 → 初回組立：'+seconds(value.first_assembly_seconds)+' ／ 選択候補の組立：'+seconds(value.selected_assembly_seconds)),text('p','待機・設計・再生成を含みます。部品の採用は、この候補の組立での使用であり、美術承認ではありません。時間不明は0秒にしません。'));
 if(value.selected_assembly_seconds===null)container.append(text('p','制作記録の経過：'+seconds(value.flow_observed_seconds)+' ／ 未組立のため完成時間は未計測です。'));
    ```
  - ADD `ui/trials.html`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `7dc4ba79b65f4fc2873b7262e3e04e27815d962f2b5a7bb0545699f9e866eb78`
    ```text
<!doctype html><html lang="ja"><meta charset="utf-8"><title>素材仕様の試験</title><link rel="icon" href="data:,">
<style>body{font:15px system-ui;background:#18232d;color:#eef;margin:24px}button,input,select,textarea{padding:7px;margin:5px}a{color:#9de}label{display:inline-block}canvas{background:repeating-conic-gradient(#65717a 0% 25%,#45535f 0% 50%) 0/24px 24px;max-width:100%}.grid{display:flex;gap:24px;flex-wrap:wrap}iframe{width:570px;height:1060px;border:1px solid #789}pre{white-space:pre-wrap;max-width:1000px}textarea{width:320px}fieldset{max-width:810px}button:disabled{opacity:.5}</style>
<h1>素材仕様の試験</h1><p>実験用です。サイズ・アンカー・接合部は未確定です。初期設定では画像生成の実行が無効です。</p>
<p>胴体の裾には連続した丸い（碗形の）パンツ色パネルを残せます。動くパンツの脚は脚レイヤーに描きます。スカートは独立レイヤーとし、トロット動作で脚との遮蔽を確認します。</p>
<p>指定された入力フォルダーのPNGを新しい素材に置き換えてから、画像を再読込してください。元画像は候補ごとに保存されます。</p>
<label>部位<select id="part"></select></label><label>出力解像度<select id="resolution"><option value="1">基準の1倍</option><option value="2">基準の2倍</option><option value="4">基準の4倍</option></select></label><button id="reload">入力画像を再読込</button>
    ```
  - ADD `ui/trials.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `aa6908236df4e9b83f85b90ff25d84839e5dfdcae8ff5baeb40297f68520e980`
    ```text
/* Local experimental part alignment; authoritative raster transform runs in Python. */
(async()=>{
 const $=id=>document.getElementById(id), canvas=$('fit'),ctx=canvas.getContext('2d');
 let config,profile,initial,reference,input,box,records=[];
 const names={HAIR_FRONT:'髪・正面',HAIR_BACK:'髪・背面',BODY_FRONT:'胴体・正面',BODY_BACK:'胴体・背面',ARM_FRONT:'腕・正面',ARM_BACK:'腕・背面',LEG_FRONT:'脚・正面',LEG_BACK:'脚・背面',HEAD_FRONT:'頭・正面（旧候補）',HEAD_BACK:'頭・背面（旧候補）'};
 const result=message=>$('result').textContent=message;
    ```
  - ADD `ui/viewer.js`; location `initial clean source import`; lines `1-6`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `f0d80228faa1c1ac618cd7c2431d6f3324afb96d014d8d1dc8d313a77b67745a`
    ```text
/* Official Spine Canvas 4.3 Runtime; use triangle rendering for weighted meshes. */
(async () => {
 const status=document.querySelector('#status'), canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d');
 try {
 const prefix=location.pathname.match(/^\/(?:character-view\/[0-9a-f]{64}|repair-view\/repair-[a-f0-9]{32}\/[0-9a-f]{64}|flow-view\/flow-[a-f0-9]{32}\/[0-9a-f]{64}|texture-view\/texture-[a-f0-9]{32}\/(?:source|v[0-3]-[0-3]))/)?.[0]||(location.pathname.startsWith('/baseline/')?'/baseline':'');
 const manifest=await (await fetch(prefix+'/manifest.json')).json();
    ```
  - ADD `使用说明.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `07526b4f8b2e52c63d6582ce0b6112c2992daaab008a76dfce7b2a77fcf16c17`
  - ADD `文件分类与发布说明.md`; location `clean initial release / PRODUCT_SOURCE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `b9abc1241810a0f9342c0b1ace2dbcf0417a5ec08aedcd78cceab86050890b20`
  - ADD `releases/spine-skin-tool-0.1.0-20261104.zip`; location `clean initial release / VERIFIED_SOURCE_ARCHIVE`; lines `n/a`; reason: 干净工具首次导入，仅白名单源码/契约/开发测试或经核验源码ZIP，无个人数据/凭据/参考原画。
    - SHA256: before `None`; after `2bb3dce1ae4e3e31a9c542991bdc8595cde1581ff58f761ee8593a7dc5a46ab3`
- Tests (actual outcomes only):
  - `python -B -m unittest test_distribution test_maintenance test_environment -v` : `PASS` (exit `0`); evidence: 30 tests / 3.116s：私密哨兵排除、凭证样式拒绝、素材导入不覆盖、本地配置不重置。
  - `python -B runtime/work/M08/release016/parallel_regression.py` : `PASS` (exit `0`); evidence: 339 tests, 280.140s, exact ID coverage/no skips/unchanged source; fingerprint 6aebc160ab078cc6c806f8268613b371b0ef6432677358baa9281d7bb11a9b3b. Final attributes preserve original bytes across Git/ZIP, no newline filters. No model calls.
  - `python -B scripts/bootstrap.py --install --online (first isolated attempt)` : `FAIL` (exit `1`); evidence: System Node24.12 differed from pinned22.17.1. Correctly refused; no pin relaxed.
  - `python -B scripts/bootstrap.py --install --online (isolated pinned environment)` : `PASS` (exit `0`); evidence: Source-only ZIP extracted to new directory on same Windows host. Fresh venv/node_modules and lockfiles rebuilt. Official Node22.17.1 ZIP verified against official SHASUMS256.txt. Not clean-new-Windows validation.
  - `python -B scripts/reference_assets.py --source <licensed-library>` : `PASS` (exit `0`); evidence: 39 required original files imported to ignored private library, no source artwork in Git/archive.
  - `python -B scripts/configure_subscription.py` : `PASS` (exit `0`); evidence: Existing operator CLI ChatGPT login reused via login status, new configs disabled, 0 model calls, no tokens copied/read/printed.
  - `node scripts/check_preview.cjs http://127.0.0.1:8784` : `PASS` (exit `0`); evidence: New isolated install actual Runtime:24 samples,11 original skins,0 browser/HTTP errors; not new generated-character quality approval.
  - `headless Playwright route checks on isolated install` : `PASS` (exit `0`); evidence: /characters,/reviews,/repairs,/trials,/acceptance; Japanese UI;0 errors/HTTP failures/writes; empty tasks/photos/sources/reservations. Private harness not part of source package.
  - `python -B scripts/package_release.py --output runtime/output/M08/spine-skin-tool-0.1.0-20261104.zip` : `PASS` (exit `0`); evidence: 204 files; per-file SHA and manifest verified, no user data/credentials/reference art. Final ZIP SHA256 2bb3dce1ae4e3e31a9c542991bdc8595cde1581ff58f761ee8593a7dc5a46ab3. Synthetic-marker false positive was fixed in the test, not by weakening scanner.
- Risks: COMPLETE限本次干净源码交付实现与本地验证，Git远端发布以实际branch/commit为准。; M08整体PARTIAL，生产尺寸、最终美术、全新Windows、完整故障可靠性和原画公开再分发未全部验收。; 无真实照片、生成角色、模型日志、API配置、订阅凭证/会话或原画；需本人准备依赖/授权素材并登录。; 原有本机资料与父项目未提交文件保持不变；不自动合并main。
- Next task: 操作者按根使用说明准备本人原素材/登录，授权后制作；后续质量验收按既有门禁。

### 2026-11-04T22:19:02.952555+09:00 | TASK-M08-USER-ACCEPTANCE | 20261104T131902Z-TASK-M08-USER-ACCEPTANCE | COMPLETE
- UTC: 2026-11-04T13:19:02.952555+00:00
- Goal: 按用户明确确认将M08标记COMPLETE（用户验收），保持未实测事项如实记录，同步文档和源码ZIP。
- Files and corresponding code/sections:
  - MODIFY `docs/RELEASE_STATUS.md`; location `M08 user acceptance / current status`; lines `n/a`; reason: 记录用户明确验收M08并同步交付包；保留实际验证边界。
    - SHA256: before `fc69d8e4d3b69a34a5626caf1dcc775734640d9cd0e8d8f4b81318b9bf35679b`; after `769c8a0dcea0be83f7c0c64bb19c97370567cd99f5e4422af331e4f3001869b0`
  - MODIFY `docs/CODEX_IMPLEMENTATION_SPEC.md`; location `M08 user acceptance / current status`; lines `n/a`; reason: 记录用户明确验收M08并同步交付包；保留实际验证边界。
    - SHA256: before `fe590689a2df7fc6d4f142c1f5306a488db30d512496fb842ccc4c096dae8bd4`; after `3aaee7162575b96a66e55a5b2dee1f3ca8a15bb26a746efb9f687884c29d7111`
  - MODIFY `releases/spine-skin-tool-0.1.0-20261104.zip`; location `source archive / per-file SHA manifest`; lines `n/a`; reason: 记录用户明确验收M08并同步交付包；保留实际验证边界。
    - SHA256: before `2bb3dce1ae4e3e31a9c542991bdc8595cde1581ff58f761ee8593a7dc5a46ab3`; after `c0c8e3ff72234c1675550cc693cede263f6dd3dabd8776f05621d8e9c1c9bf89`
- Tests (actual outcomes only):
  - `release archive manifest/byte verification + unchanged-code fingerprint check` : `PASS` (exit `0`); evidence: 204 whitelist members, every SHA verified; only CODEX_IMPLEMENTATION_SPEC and RELEASE_STATUS differ from previous archive. M08 user acceptance COMPLETE appears inside ZIP. Code fingerprint unchanged at 6aebc160ab078cc6c806f8268613b371b0ef6432677358baa9281d7bb11a9b3b; no code/UI/threshold changes, no new model calls. Prior339 tests not rerun or relabelled.
  - `python -B scripts/package_release.py --output runtime/output/M08/spine-skin-tool-0.1.0-20261104-m08-accepted.zip` : `PASS` (exit `0`); evidence: 204 source files, no credentials/photos/reference art; archive SHA256 c0c8e3ff72234c1675550cc693cede263f6dd3dabd8776f05621d8e9c1c9bf89
- Risks: 用户验收关闭M08，不伪造未执行的实机/云服务/生产尺寸/许可测试；不改变生产开关或其它里程碑历史。; 仅文档/源码ZIP/日志；无照片、凭证、原画或新模型调用。
- Next task: 按已交付工具与根说明复用，后续改进另行记录。

### 2026-11-05T12:27:50.764650+09:00 | TASK-M08-BUNDLED-REFERENCES | 20261105T032750Z-TASK-M08-BUNDLED-REFERENCES | COMPLETE
- UTC: 2026-11-05T03:27:50.764650+00:00
- Goal: 用户要求同仓原Spine及对应素材/路径一致，后续明确保留启动器、自动配置和界面；当前冻结已验证功能、完整记录范围。
- Files and corresponding code/sections:
  - MODIFY `AGENTS.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `1221c205d3f166b7519ef198318f23a8486008ca30521b76eebcdf06d03b9c1b`; after `b5f1ea4faf3b9245e98eb625b61b87df8d09e7a0cb7bc2607fbe6624d6287bed`
  - MODIFY `DISTRIBUTION.json`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `ccbdde3ef9aa871fe93855e549f01a7464c463e12c5b7da0384a8b1633da6cf9`; after `91024ae4144a3f7285e1d1bef7e9ca7d78a8d4364f00ca72ba412a8033a83b94`
    ```text
{
  "schema_version": "1.0.0",
  "release_id": "spine-skin-tool-0.1.0-20261105-bundled",
  "source_directories": [
    "src",
    ```
  - MODIFY `README.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `2a22b83044a1710c817d0604771648aa5a0a7695f2bbb556e0d90b6355978083`; after `7097f008b24f399eb3f3a47a52fe78b6b7cf5026ddd546652ef025a127fafd2e`
  - MODIFY `docs/CODEX_IMPLEMENTATION_SPEC.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `3aaee7162575b96a66e55a5b2dee1f3ca8a15bb26a746efb9f687884c29d7111`; after `ecabf32f1ec0bedcc27f5735764b6ef0e41e1df4dac6c4caa72bd9ef5ed529a7`
  - MODIFY `docs/OPS.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `a09127c6881ee69cfc83e63e043ca662145f947f78ebaf7dc8781edb89a3d494`; after `c063d509f0db4d1739dea1df3739a720c6b08ffc64445a051ae2db6816cb5dd6`
  - MODIFY `docs/RELEASE_STATUS.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `769c8a0dcea0be83f7c0c64bb19c97370567cd99f5e4422af331e4f3001869b0`; after `7dac5a229db542adeb46334f2a8c986c1db0d5ab035fb276ece92748663882d6`
  - ADD `references/spine/ASSET_MANIFEST.json`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `52babac46ec886b13ad01ec632e25abdf99ba20e248bdc9b4d85dc06ad56dce0`
    ```text
{
  "schema_version": "1.0.0",
  "revision": "bundled-spine-reference-001",
  "reference_only": true,
  "commercial_use_allowed": false,
    ```
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/chibi-stickers-pro.spine`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9c7dcd10ef15f04e7abc2b5fbac2389845991defc0c91bfa31726256fc4ba515`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma.atlas`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3c0c3ed4b6863f16c0e10b74f6296e6a831c77ae528223c7a7bf932468edeadc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c7082b0ff2aaba3afdfcc94c0563a8f2a4767eee3ffb5e5b07cde4f66fab80d6`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_10.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6ade7976138d58580d6f08f5676d000506c76c139a9baac43dad0290cc2a8493`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_11.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b20a97c5127b711e53e124d5b7ceffe32f48485d694c5fae900c1646a3cac726`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_2.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `fd1e4ee81bb7515cda84d01d8623c0133912d8225b5f26c05718682b85b5a9ba`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_3.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4795e477edc17e13db2879be804936096adb495da079ec1f6773f696cd14cb0f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_4.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b366fecf9a16a0938e9d3463c67683517093495930ee0ace76c674d6ef752fbf`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_5.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d13031c36041328e7a09399b695cea218764b8e3acc3e3ac020191d20b9d40bc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_6.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `bb60441977a88cf4a296549e70504779b131e8c4a5e02a1dfbd1cf253e9db566`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_7.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a5506e8e8187df0fa9c22b427d11aaba3c47313f1855927214878feec6532dc0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_8.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `12db47768de40bb2a21fa44406777d6fdc9bbc39092b69560c41a790aef4d47d`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers-pma_9.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9553f31b51856d92e1b591f246de4dc462443bc8f426a07a995b44606af96b9f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers.atlas`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `e8609249909788d2c3ccdf8404c346f9c1e0e98a764fa15bed101acd17f8f7b0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers.json`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `591f69af04414ef348d2df5b1446a9a8a4f7f91c153e5aee0193ecdbc9e1a046`
    ```text
{
"skeleton": {
	"hash": "332sNAu1s4k",
	"spine": "4.3.75-beta",
	"x": -179.99997,
    ```
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `00eb71f6c6b005956cde903036e163a50ad6abe1292cdb5327f99838cb76b81b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers.skel`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7d4b3c712d1db52776206e08a163eb95d1112a0e96813483f44feac1e0918eec`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_10.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `97af1a8c3925e0bd3dc2a85b577287a269c260c6cc1d8058d2f15a8825b8588e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_11.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c1cde5ab1f8922f50f3eef5be52d603b1a4cf93fb152337f2309a9483ae5f4b4`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_2.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f1c9b4df76c384c2ea9c29e150a0272844731b88dcbe829973658a3349e1bfc5`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_3.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c460e6c08093f5c83e3e527518b1fae8191b600d9064c08f7fc5c3248347eb96`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_4.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `61af121670355c66fd5fd3f7fa74cf1cb913236fe8e7a5903f2dde187de223a9`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_5.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `48a88eea4140bef9c187893618543b6e8bfdeb6af35744a21b646558eb45cd85`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_6.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `318456c4b2e358f06690c906b325124eec52ce3587b4944ed3c6c9dfe293f697`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_7.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6c9bde7f04757e48d4ff8555bbc240c91e07ed747f97610899283912e8eeb199`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_8.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `2a02271ac51d44586c075a1169b12e20897a37f437c82a5fecc0152c8b9eaa30`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/export/chibi-stickers_9.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5c257c82008b137252c55800de12ff7023fe7288fbc2b69121a4ce200737c890`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/angry-mark.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `2f8ea3bed441fa18209bc3b712e2b6ce4f92f90225ef4aa8cca86f6c3cae8aed`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/big-purple-fear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `dc6f1a1b4a8b7759ae5bd02d168c7f98cc5a2a6a1665e67ecbaa61b728779c9d`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/big-tear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `fa2c0576cefe06c72d4cc210fecea5262e9b3c06cf91a88b4950a4ae9e214fe3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-3.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `240222bffc27883d1b6fa52c252f33f91d8dee87eb6aef97cba2bc7e2b0fffdd`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-closed-happy.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `eade105c0e4e0d136859d2a59ac5a27cd267f6ffb8433bbaa77370c9153f79cb`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-dafault.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `22a1124945aa1912405719d6ae9c8184b235e50c9a8d5ac1ac22247c552f1f24`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-equal.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `61e9d1293cc52b358ff749c23b35741f6099690e36b9269bc9e8372fe6e3de78`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-fire.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9702523df46cc45bc7d312c8a2740062a549fe8493dfb48ad285cbedec40a307`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-half-open.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6c7ffcbbb09360854db3dfa2f078817d51c0b0d366cc6e00b31e808e4446b4ca`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-heart.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `abd2928169f96f1cd7759a5348501a8ae7c03d750890e183bcad5d19f6802b96`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-reverse-v.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `201a7aba5c731fc5267e3ccfddc128086589c8b9751144acd455982ebd1318b3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-sideway-v.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `dd646c5c959f75ffdf59b78bfc1c01fb43578d57f4e703631c3f72553751a069`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-slant-close.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `bfe9949c300c802b959a113479c9f1514f9ab7c16dc7de61b2d504ec8234ca1f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-small-dot.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f9c173ec210fd81a952655b64c1b2f73b525aea22d61f7755d7a50b40b2d6cc7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-sparkle.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `ba94df7db390eb59de27c799f25444692b667d279315a2fe793e149d05eb430b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-star.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5e9f4a8a80db6ec846b61d7823f1b9a857790ecdc8ec0a8fc57098248f24b737`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-twirl.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `91a4207bbbfa9d5a344513a1ce49fac8e38ce7afe6ef607c7fcd99e5006e636a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-u.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `fa9d134a71b34459dfa098ddc50beb72771a01a1695b5ce2fe2f0ca1574dfe33`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/eye-x.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1e9125a22cb2b9bf078f1cc9d3b3d6cee670bbc85b6147441a97bac737a6aabc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/lamp.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c2cacefb6cc9584d9a7ce6880ca2f818ccdf18284ae44defc28f23dbe99466e7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-3.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4aa8d79fd69fadc267c7836cb682f52a388bd20de06f31ca83e0bdb8bb1d1894`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-bracket.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `da29828852756e8deab18659f8a761d1032e96c3cd43e6549c1eef09664b50b1`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-doubt.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1c4241f9f260a1cab90057a055434e7ce1af1efadabb6f3121cd9ff951b261c2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-fangs.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b0b3cc6c4be297ff02eb2be9f94c35f614a61c4d878d71ed3da40424f6d7fbbf`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-line.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f7a338cc76391b934bf14e0433c450ab8eb882d7b9c75ad1b26caa40148a35ed`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-neutral.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `0a1c8eaac6d422a261f45f34451fc103db6befe6b3aeaaea1d0ec9367a9e597f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-o-tall.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `064d8131270767aea049e723017c56a3bba6f425540fb9229dde6241066813ed`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-open-smile.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1145a6c12281682d90d0bca703e9a60ff649ec6655c7efeeae67d7527a1b11d9`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-rectangle.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b1fe06a4454c6ebd309660a78a050ecb1c61d7ee53db1c78b859fbeecc3858ee`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-reverse-v.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `903083e5e729d017f840b7babd1be9228d0f4699c60b9f57f21eb11b208f2092`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-s.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d3453ef976e4167bb172ba97a2e9c07b4f0211432a35d06c042018a17fcd32b6`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-smile-little.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9bc52c77d9c1e4aa631db39458c1decdf9352f0386f01141b1ddca0000894af8`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-toungue-sticking-out.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `ad988846c3673de6698cf75974f679c0033fefd9226cdc88227e71ed9966e7dd`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-u.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `0c08d6365a4ddcf99988df62de3d63984077e8f5fee4e20cf2e2dd77c51a6053`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-v.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4c75f586096a16d499fd5ac9eebd5c44645a2be45ac31b46b8d1a81d4133a7f7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/mouth-x.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f2bcb017da3d982a7b8a8758a5e918d7527cc6eb9ca09160f1e0ffaae8cbf26c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/purple-fear-lines.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `cbf16163294f22e88af1a283c8b3abc3c77ea55f1ae74ade656b73bf86b4cf04`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/shadow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `63a9fdd09e8b8e1bfe283a16eec4b5cfaf59b5b775873a7f804c0f278bdd30a4`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/small-dash.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a429c48412f84cccad248580532a2acbec8a6959f98274dd2fd42b4bca68b1cb`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/small-drop-line.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `ff995c129fa4198abaa7bcb95d989831e67064b29b2fbb8d0759b8de91922649`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/small-purple-fear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6001f9706768503875babd75edbe7b71de6491ca1c3ea7f63c8af0dcf272d44f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/common/tear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `73645decd3848db74baf5709c5e5b352e0ad794446321805b61d60051adf756e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d360cb14f588aff71cc3261c3709141f4a3e6d10928d1a575b48d39640beaba6`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/body-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `dbc9df785918cd110d6cd099bda98cd1870e2e2d143d775b1c970e54e9e9ac72`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f7233ef281765d4285bbc832df4d99d33e5a1cf1716dae752ceea3d12592eb9f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a3fb2de6255aa5c09a8414ac678c497cdd0ef6b2cf8a164a4dc4400972690e87`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/hair-back.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `23708f11826ae324830704ad22817169dd2fabd1c0cea0497837dd7ddce8c7ff`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `82ca19701fe3c141fdeb5988217966183eb764a657188c1ed2e3edaf8ebe0636`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/davide/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `abcf2ee3f24fe4a8094de9ccdaad03b44bc7e9043afb64303acb38b7953b8832`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/arm-shoulder-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b948ae4830ee79c025f22cc2977e1309ee6f7482fab79076c9c6a704424e016c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c8f98ca9bfc1dfdbc3a472706b0b574288788c4e518ea8c719e8a429c4fd1074`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/back-hair-long.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `47b804a4fb58ce1fdfe74cc6f6e84eb6807326f4f965ed90384c0c3979f3421b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3c845dab5b7daf0a394307417dfba42b2b9047545f00dd3daf2f7b66d8da8fa1`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9857bfaa47b41c625023083f943d08d5593a42f5ff8966fcb17cbe1c6c41ab34`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `213897d6ddd45ebc4c2f5e882ca6d48e8b2d8cc9400b6a352c1960cc921a544c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/bracelet.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `033933434623ef9e908e88de1685653739f74f2a0b4146482752c0fe0cafbba7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/collar.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `57296ee3150b5ea46c5e73858a69e5f977416f60a460f09c19e0d73a4fe13130`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8b1fcffcc2ce9442894ef6b494127f58348a95ba353b0f3362a2d54c849bdb12`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f41fe7e5b611ee8af5ac42af5758325004bf9d7c4e2443f60a3ed3858826a10c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7f89ba951c1ab8636f8b7386f786719b25f354592bc0278e68cc67963b1722a7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/hair-side.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6c9c8950e4ecae023f41fb8d83c7961d4728a4bf6320dfa7c7e6a90781d2f8bb`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/hat-border.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `064d1818929295ae89c94699935b054c96ed546e01b02c5b36467d8c24270124`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/hat-top.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b59c220cad0b0264e63e18f4e66b4fe2fc43fe3c99cc5d433c76d9c3c2558675`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `261332fbed014746ec1db40efb2787aef9b689a8b872a512fdde7937a9356bf0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/leg-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1544ce170def78ca3c6543bf39c3689c64a4b952f2db4e6d234066025bd8b711`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b0240a1611eb67eaad9621d8a620e9262af3e87112f99e05b9258bcf007bb423`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/skirt.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `45438faa6d3efe67657467c0209e998d26589de250fd87d6dd37ce2f574cb563`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/erikari/strawberries-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5bf087cdd8514e4929f61077c45cb84618a7f98d911b4409abd5fcfcb572c7e2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `87c76f104a1757f79030874293a14d87e9f1f0e3633ff2b971fd82da4dce2cb6`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/back-hair-long.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `2e4dd22c7966aa2333098923edd207700dbf40d280c856b3aac38aa8ecb3d7a2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `e80a75bd86691f5ba50d2ad58c97a2e48051ba82f975344bb24f411e97af787e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/beard.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4cbdabe31f822ffe0ae49df163b0dcc26abf5bfad934332fdfc844ed84baf633`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `053a324447fbe9cd4940e9c2964c28a90559a6ae8dcb5c4de91e9bd160c68ae3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/body-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5c80999cc57b7c0b6c2eaebb80353c0994006e1fb709c7ef595616a73bdc6d58`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a5950ca73186342f2463161d15a83bec0091d2bef8b0534383503d7ef8d55b61`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a7c43dc3e11138ee2f9c6dc37485f721dd2453de006e539da2d83b4e11a40afc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9941b827aee7b5051410dbf691d72b6a86b896a76c410682fc6018f8ca29197e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7fc00d1708d324c6c2d4c22faf4d6e21579529df4928bb2aa48fe7d36fdbc503`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3b116e45e50160bb05f9e61d79283a5f15099424b21c979acfbe317f0c7350f2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f555016dadb2f87ddb03f992129d96b6d469b5d9e88e37a053022c858b391772`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/harri/sword.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8b1dfe9830f5babec240ef14393f3782612b9870d3bd6a59c1b59c4f0c1c4d88`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/arm-shoulder-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `85801baa3a32bc7741931faa58fb14580d099c1f572527cfc72971b6feeb685e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6e6d9fdcc187f1c830d37e759f388fe02ce9aa3d5f73a729019e9b6f64dfab06`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f387762394571c63c17f94663adaf66da4abd6c4e7197f7b12cb0ca7788ebfa7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `053a324447fbe9cd4940e9c2964c28a90559a6ae8dcb5c4de91e9bd160c68ae3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b129e498d0f00397c75963893c6b014bf1a48710af18a3d4c858f4073965fe48`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aedd785df8a60ea506e495697d5cdc15b933610f5d089c095324ea663cd50a6a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/face-cover.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `153fa6fcb7e567267df5f8f9ef2a2b9f93ffb9ef91e38b0e66a67add97860574`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/glasses-shadow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `ee7cf4ade68b1aff34081a5b07866e280805c74a49ae6db9c2c75794379951eb`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/hair-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f90796d91392cb2d724fb09c815176b0f3407ced931e83d65392de4bfba34ee0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8738ec4e21cfbad9ba1f2af371c15685ebe81aa3921b6e550a82e8e45c833550`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3b116e45e50160bb05f9e61d79283a5f15099424b21c979acfbe317f0c7350f2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aafc0c09ef874ef6565a9b2753271d5d1a487b8698b3e221e33df82d67cd122c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/shield.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `805f88daf499b911adcee84bfdfed93b3a5755afdf60eb334c6b66d9e39ad614`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/skirt.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7133ed046b17f2de6f9214b06fecbd216608c7beedc7c75fb63db870eb8b2293`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/luke/sword.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c9e68913fa50d60fb5490cd02fa33b51818dc6333a9edd0ba606b094dbae3617`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8b5c3e1cabc98139889c36f06ba0438e8cdcf213ff1ed397cf5dcccb679de2b5`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/back-hair-long.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4fe5883298a42cda749eae80663eb402704b4c3249c310fcfc589b624c55b07c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4d2be44ad9b438e9708a5789d81b0ed385a29a47fd54f4aeb8de0d523631cb17`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/beard.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9b0955c9f65520df16a6201591969e751b1ac0ed91a10a3675d5b630059a8436`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `557a47298392cff920be37cdd5a29ddcc890e968b4d0b442c79c4b995eddda93`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `85ae01d2fc6f78c010f40a1156af07afc59a5d73c8ab50eda4f1c299873836c7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `651996d61c383ff01ef2c759e00ad63bc721de002dce40562e3d8553eac4913e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `0062874cf778c4246db218663766c626f4f02b2b794d418c14698fcaaa77bb78`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `b66004cea52457c6651b35b737e8a211e1930b994dee007fefeb582f07a1223a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f43ba5a52ae3038ce3f521bd927540ace8ac94158497aeecf017793363ad491b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/mario/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `217cb14bd7f7fa8c54970d6b98f7bb0d52861ced0dfbfcb0d9d16b21349422f6`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `cc01c11a9d632f2d301f0796dbc903fddfee2846c48fe2a8ab87ed68a8419a50`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/back-hair-long.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `89a344d9efa579790d82dabbb9d54bd2dd1e1952ba2fed43b5003a8888f2627a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `03544d499f77cf69c60e0e14757c0013cc3cf9f97aeb1c29378b54bfcd9ccc46`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/belt.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1399c5423088b9e1036959103286c21875cb67890b9853614fd8d1a15e187ff5`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aefd1cf966e7f758411194c9d30ce45c367af8db355ce34714846e5756c5c23a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `bd6cb2a5f75caa1e2613b37df8f2a1c3e69fb14b6742cc0d54d3ff6c86d33615`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5f839ea8e1c00ee23a3e29f3b860745b0dbd0a8bfe3d5ffda827ba1c471c3ea0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `fa8adebb20904b2d45448833252b5dc5d7ba8338acd6500e25d49a8c0d83d32a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/glasses-side.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `da1210ee11be042f6ec2a0d71cd029cf1e27a52e2a71d080e7df891e4319480d`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/glasses.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `19ca19ad20a5763bd98241051dc21489e087a4303ffd65f28050bcbbe96fdf1c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9a38d72eab7658165ea899de67579404109448a354b866d8f17888a6d7b02307`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/hair-side.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5439b614b9d2bef54d95ac0db2223e58d2e20b2cfab9b84fa7dc1685f8505935`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `15e387b58f53e6c0fef224fa583196e713a0cb1c756404d7ae9911b09efe819c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `4d2637f5040d74df6dd1b22c15c7c1cbdd27ec9e30c25478cec55e9d447d52ac`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/misaki/skirt.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `ef2b0ce635f769fe8766ac0cc8449f82cc12e9fd2cb84e694dcdb1b3712b328f`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6b68f3588f02816e5aa8bc367b794e86a1ba537890ccd61cd29138a238e9495e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `e836f041e8c1e79bc13d7eedc7a05d5837bdbf2a99e31a56910298abb25b2740`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/beard.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1cf83e722f611a4208f53fa31551da3c4b8f8089554ca7f5769971637637a018`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `053a324447fbe9cd4940e9c2964c28a90559a6ae8dcb5c4de91e9bd160c68ae3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `683b8e1f0f26da45abb5a873d394880d2d9335d6a268e8afa59d8b2a79768ebe`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `9e0378bf8bd01d85d03260efe3966041b21704909b4686c8140de448f18c0910`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aedd785df8a60ea506e495697d5cdc15b933610f5d089c095324ea663cd50a6a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/glasses-side.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a51db20cdce7b178a75ed4540778e2414b113c894b861dec3568e9f611986659`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/glasses.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8c8801405cd5518aae6d6d28da71237a106a3e31a087b3bd083ca24cc2338cd0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7dae3713db0d5c8a2ffa8ddeb4d522d6755f4733d59c71e549f404f645fd40fa`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `765eb1d278d538d1dfa629431150e74b7706af833599cd409a8a00e66562a4e8`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/nate/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `30a59ec1fb6f3b0226af4ea1e7deb4eb01d60532a35f763789e0a04b946e26bc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `407b9a8cf60f4e181e3c524646a13d80dc73e8482465073feadd889afc44657b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d397874cfaebf398341ca4a93109d4d471a4dbcc168c9b9b4c7090363853e0e8`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/beard.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `374cac66d5dfae1917d0e397c2a276153a4441a9d1dc79f8624f3d49c18e7765`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `98504e7bbe614c0da7d4d0696c2b4af71d4dcf56e1e45106d0cd7e7916bda8c0`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/body-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `17586984dd8b832214c0655e5337037d40b03bf188b58f3f396efbaea4535a0d`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `11ffb8a01d81435d349a2446b365c1cb44c0f17ae331b2cb05974af670eeb7fb`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7dd050eb9318371f8b4bd438a5d3a1501a1423769189973fbf6a0fa1c189ac0d`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `341aa197ceb26e4976ea76690898221ba6b08da14c976b9275c06184fcadec4b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `04ad0bd962b53e45954971c07d3510ec5c0f9a8cdb9590e3589426b28ef318f7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `67fd52d398a34129859334a712467350d8021b7143fdf0f84b82338f764ff969`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/sinisa/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7e23a010166763060f6dadf52a137283427d939704411038212f4c0da13198d8`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `591318c40d105503283c0703be4fb7d82e0b7d12dbca6501cdc102607c08b0bd`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `969adab67e1a696aa09236d2d9fe88e2b814f207a548b47b8892c2680aa8b373`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/beard.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `04344a5578541da5b871ebc02af7cba8d565035b9e95601ec497de30f6a792db`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `532d83595138896b1cd398eed9a6b6b46fc3f9c93587ef3e57a97c89e63faa43`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7a5d099c194cd01aa5adfe96412ec9ee0c253032279de10969d72f7b402d053c`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a7c43dc3e11138ee2f9c6dc37485f721dd2453de006e539da2d83b4e11a40afc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8edca283380826597c22e9db7d46f944147c438331956d58942fed33a366efc8`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/glasses-side.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `0a0891bea15591aa7d2cbb7f2a566380169f71118e4b3e0915fd3d393d490faa`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/glasses.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5d45fa2966cb90e9abdcfee69b5937b35de10f16d4da1d4edb3405a40f473d46`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/glove.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `e4af74ed86593304207c908cb574cbacbbdc099c8a31c047fe67c8501a663e22`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `461487f99cc5b1b88c047be7512a97ba322d3ec7e0b3612874ad424635afa4f7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3b116e45e50160bb05f9e61d79283a5f15099424b21c979acfbe317f0c7350f2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/soeren/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `0e0c9377f0d885a0873246643098a2b7e46a497a8a71ae2730466eac6f659a9e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/arm-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3a211589f36b0d15846d05c3d2e77b185d40350cca0a056bdce81c8da88031e7`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/arm-shoulder-decoration.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a968d31fbc2d41e55d9680bb4c288167b127095f57f2395c0c7fa26546c42782`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `7660014a2a9134bd65e1b6d3e6c68b363c58dab433a30de6fd9d26b835d5f9db`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/back-hair.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aa7f0fd3895328637ccd57dd4f357c96e503d78f9a5c40dbbde25532bc48c203`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/blush.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `053a324447fbe9cd4940e9c2964c28a90559a6ae8dcb5c4de91e9bd160c68ae3`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `e1c7fcb68e7ba20fa22d39074d6e50e001b481f0f88137c1555395810f90375e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/ear.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a7c43dc3e11138ee2f9c6dc37485f721dd2453de006e539da2d83b4e11a40afc`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/eyebrow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `aedd785df8a60ea506e495697d5cdc15b933610f5d089c095324ea663cd50a6a`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/glasses-shadow.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `015686b2fceaca24c5b554953a0faee92a5963a3432dd11e3980ec2348d8199e`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/glasses.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a4271a8a1530136691ed937bf0b0b3ceb161e98dac0f378e4c4f771fd51a7262`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/hair-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f773513a06508f5d171823faab863b2b11d16b5dae176d2b6f0229ddb1c79d0b`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/head-base.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `3b116e45e50160bb05f9e61d79283a5f15099424b21c979acfbe317f0c7350f2`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/images/spineboy/leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `fdf24176b823b941db66bcfd885bc21e7e2b174ef3b5db986e9623ad82acf658`
  - ADD `references/spine/Chibi-Stickers-4.3/extracted/license.txt`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `66a6298677e45ef485f0aaa62944ef70255e1f0c01b57df7acf85a945998d234`
  - ADD `references/spine/REFERENCE_ONLY.md`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `951555b9c5113a6631bd0845bf9a2d9c39c724e94002359f9460a0a1b5b5172b`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-original-template.atlas`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `bcb3f8d9c697de18a9bbfb38259983e2a34b7e67faf098f897691ebc8df912e0`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-original-template.json`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `1e069d208ebaaa8c3eee459f26afe61d418ad03e604f2ab67fa710b8f0daa651`
    ```text
{
  "skeleton": {
    "hash": "332sNAu1s4k",
    "spine": "4.3.75-beta",
    "x": -179.99997,
    ```
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-arm-back.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `de004e6393a645c22c4268048f63e18330f4e29ca71e411d92f63e35e1481b9e`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-arm.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `8a08e3cbccec6f5eb78b7ea7ee9d1cd23a9992ae1daf24bb3cc8b7f54d0c6955`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-blank.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6fa466e21df6bf014ed03517399a711777f572b1f0be6a561b947790cda9f634`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-body-back.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `bb40f6e12a72d46b6ab4cd593d7c49589b130911033bac141ac9a054b9117ce0`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-body.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d8db5b5be31f9f87d2438c197d744df6e8a003fdedd8a253430ef148e923b8ed`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-head-back.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `353db5afd85d59569309a668e1eba3da3fd1b1e0bcf03b86c12ecc0c96c15d90`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-head-front.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `88ed7a9574a1fa752fee69c68bec9b2aad2a6660ba06c0bfa2d58423e266ddab`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-leg-back.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `a9dcfc6da1c77c4e3e9fb8321b6bf304f624c13394f559a250dbe6c81c46aa00`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/ai-city-template-leg.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `181e575532fd8dda5f8b0a61a57052240ef5f72f278fc6c97243f4a12ea3c5e2`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `00eb71f6c6b005956cde903036e163a50ad6abe1292cdb5327f99838cb76b81b`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_10.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `97af1a8c3925e0bd3dc2a85b577287a269c260c6cc1d8058d2f15a8825b8588e`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_11.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c1cde5ab1f8922f50f3eef5be52d603b1a4cf93fb152337f2309a9483ae5f4b4`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_2.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `f1c9b4df76c384c2ea9c29e150a0272844731b88dcbe829973658a3349e1bfc5`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_3.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `c460e6c08093f5c83e3e527518b1fae8191b600d9064c08f7fc5c3248347eb96`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_4.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `61af121670355c66fd5fd3f7fa74cf1cb913236fe8e7a5903f2dde187de223a9`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_5.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `48a88eea4140bef9c187893618543b6e8bfdeb6af35744a21b646558eb45cd85`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_6.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `318456c4b2e358f06690c906b325124eec52ce3587b4944ed3c6c9dfe293f697`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_7.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `6c9bde7f04757e48d4ff8555bbc240c91e07ed747f97610899283912e8eeb199`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_8.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `2a02271ac51d44586c075a1169b12e20897a37f437c82a5fecc0152c8b9eaa30`
  - ADD `references/spine/ai-city-spineboy-skin-v13/spine-export/chibi-stickers_9.png`; location `REFERENCE_ONLY original source / pinned assets`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `5c257c82008b137252c55800de12ff7023fe7288fbc2b69121a4ce200737c890`
  - MODIFY `runtime/README.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `2c48f41258deab3f3f90c9b9390014e885fba48e42a823fb531ba37e4cb868d5`; after `1fe0916be5042ae63fd06ded414111f76032dad1cbc12d6e29ca46f596b68181`
  - MODIFY `runtime/license-manifest.json`; location `bundled reference / explicit subscription launch / distribution`; lines `3-7`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `fae1a81cea22b06000cf06f51c7ec8c458e0810febf3be5e6814e999e757c62b`; after `5ba670e8667b3b6e2fe68ee0c88982d703ccf78db71358e6d8673de24db62200`
    ```text
  "assets": [
    {
      "name": "Chibi Stickers 4.3 original reference and fixed runtime template",
      "path": "references/spine",
      "manifest": "references/spine/ASSET_MANIFEST.json",
    ```
  - MODIFY `scripts/configure_subscription.py`; location `bundled reference / explicit subscription launch / distribution`; lines `7-11`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `f526f01a343e21c5b76eb63ba13c7d48a14308af54df7af24b9116b3f97b8173`; after `8edc6df67bfe5173ba6fbb02ec7d56441d0be1908c96672d96e7251c8a782e7d`
    ```text
def configure(root,enable=False,calls=24,preserve_existing_limits=False):
    root=Path(root).resolve();folder=root/'runtime/secrets'
    if folder.is_symlink() or not folder.resolve().is_relative_to(root):raise ValueError('CONFIG_PATH')
    folder.mkdir(parents=True,exist_ok=True)
    for name in ('providers','design','review'):
    ```
  - ADD `scripts/launch.py`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `02c375cc6418bb9d6ed0e9d7d61432d83940f0b46570114ee6ded0c0c9cc48b7`
    ```text
"""Launch the bundled-reference tool, reusing each operator's own CLI login."""
import argparse,importlib.util,json,os,subprocess,sys,threading,time,urllib.request,webbrowser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.dont_write_bytecode=True;sys.path.insert(0,str(ROOT/'src'))

    ```
  - MODIFY `scripts/maintenance.py`; location `bundled reference / explicit subscription launch / distribution`; lines `65-69`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `cc185960888fb6df5293e9387ab71dbb5f31f1e826a4dfff2c0c97d3fed3c577`; after `c5e33abdc216d3d1263d694fb7fdf7bf0b8599fd42ab2aad8e903ff267a6987d`
    ```text
                m=verify_archive(ROOT/args.output);seal(ROOT,'source_package',{'status':'PASS','message_ja':'個人写真・鍵・依存物を含まない開発用ZIPを検証しました。同梱の原参考素材は付属ライセンスに従う参照専用・非商用です。実行環境同梱インストーラーではありません。','facts':value,'artifacts':[artifact(ROOT,ROOT/args.output)]})
        elif args.action=='verify':
            m=verify_archive(ROOT/args.archive);value={'status':'PASS','kind':m['kind'],'files':len(m['files'])
    ```
  - MODIFY `src/spine_skin_tool/distribution.py`; location `bundled reference / explicit subscription launch / distribution`; lines `23-27`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `f8440d1c31ded507f23de614fcf68f9b7e6422d2b4fc957bead175f3987219ef`; after `a0726642ad0cd0e3753947bdc67f7851d5f539cbc8715978e8e6c86dbe69e9e1`
    ```text
    reference_files={};reference_folder=p.get('reference_directory')
    if reference_folder:
        require(reference_folder=='references/spine','RELEASE_REFERENCE_PATH')
        from .reference_assets import verify_bundled
        reference_files=verify_bundled(root)['files']
    ```
  - MODIFY `src/spine_skin_tool/environment.py`; location `bundled reference / explicit subscription launch / distribution`; lines `77-81`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `26b9ff6480b41ba0c6ac746e5c00737f6352702964b213135771a9d5d6e58a33`; after `32425e9b4fe791c30f2ddfd186cf2904c3c356482de2d65cfda69248b4dcc997`
    ```text
    if (root/'references/spine').exists():
        from .reference_assets import inspect
        try:
            inspect(root);checks.append({'code':'BUNDLED_REFERENCE_ASSETS','ok':True})
            limitations[3]='REFERENCE_ART_COMMERCIAL_USE_NOT_AUTHORIZED'
    ```
  - MODIFY `src/spine_skin_tool/maintenance.py`; location `bundled reference / explicit subscription launch / distribution`; lines `107-111`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `52197a86b7feaf3d2a2392fc375af57e83d5b28f2722c5b6518ec99f27437550`; after `d7df65b45ba73683e8a270cddbdc9a39fd455d66d316bc8fb41f0f5d8aec83d0`
    ```text
                  'files':before,'bytes':total,'privacy':'PRIVATE_PHOTOS_AND_TASKS_DO_NOT_SHARE' if kind=='PRIVATE_BACKUP' else 'SOURCE_WITH_LICENSED_NONCOMMERCIAL_REFERENCES_NO_PRIVATE_PHOTOS_KEYS_OR_DEPENDENCIES' if any(n.startswith('references/spine/') for n in before) else 'SOURCE_ONLY_NO_PHOTOS_KEYS_DEPENDENCIES_OR_REFERENCE_ART'}
        destination.parent.mkdir(parents=True,exist_ok=True);t
    ```
  - MODIFY `src/spine_skin_tool/reference_assets.py`; location `bundled reference / explicit subscription launch / distribution`; lines `1-5`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `ae370d0c5b032c021cef58e4485ed0830e30ebdca3da7f68a5bc4e0ca47ec709`; after `0545ede11f7703973b2a2f8d0cb4c71e1963538f1b13caa0e5be45d66a30c352`
    ```text
"""Repository reference library, with explicit original license and pinned bytes."""
import json, shutil, uuid
from pathlib import Path
from .design import require, digest

    ```
  - MODIFY `tests/test_distribution.py`; location `bundled reference / explicit subscription launch / distribution`; lines `6-10`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `f686f0659aa79f7a116afe89fb38c5a9e3e2d673086bddb38c777e05dc656093`; after `21e279ac80c5d9d4afcc86f1a4f3c831ed7486b42ead5fc39b7b9a4cdcb8781f`
    ```text
from spine_skin_tool.reference_assets import library_root,import_library,verify_bundled
ROOT=Path(__file__).resolve().parents[1]

class DistributionTests(unittest.TestCase):
 def setUp(self):
    ```
  - MODIFY `ui/pipeline.html`; location `bundled reference / explicit subscription launch / distribution`; lines `4-8`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `1c3d61a17c77c1e17b7203fe6a8c427031b857ce91a997ede020078fe76ba7a1`; after `f8e2b6045dc3dedcce7cd148f6a2a3cceda95df88dbc3aec17f1653c87c99e4e`
    ```text
<p>元写真から設計・全部位・全身構築・動作レビュー・有限返修を順番に実行します。頭・表情は原素材、耳は原写真に応じて標準の小耳を追加し、原耳は常に非表示です。腕は標準形状の配色です。判断が不確かな候補は「確認待ち」として保存します。</p>
<p><a href="/reviews">レビュー</a> ／ <a href="/repairs">返修作業</a> ／ <a href="/trials">詳細な素材試験</a></p>
<fieldset id="settings"><legend>新しい制作</legend>
<label>方式<select id="mode"><option value="GENERATE">元写真から新規制作</option><option value="HAIR_REFRESH">保存キャラクターの髪・小耳だけ再制作</option><option 
    ```
  - MODIFY `ui/pipeline.js`; location `bundled reference / explicit subscription launch / distribution`; lines `2-6`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `130404d955514969e20c2d4ec7b6320a78edbd7cc94b03705cecceedf11a076f`; after `046951aaf7758c807676131f5f4ea2bedb980cf1558540a0c053f9d367e0e012`
    ```text
 const $=id=>document.getElementById(id),names={PLANNED:'計画保存済み',RUNNING:'制作中',INTERRUPTED:'中断・復旧可能（外部要求は再送しません）',DESIGN_READY:'設計の確認が必要です',CONFIGURATION_BLOCKED:'利用設定・残り試験上限を確認してください',WAIT_RESULT:'送信済みの結果を確認中・自動再送なし',ERROR_OR_RESULT_UNKNOWN:'エラー・結果未確認',OUTPUT_BLOCKED:'サービスが処理を拒否しました・自動再試行なし',STALE:'元資料または仕様が変更されました',CANCELLED:'後続処理を停止しました',REQUIRES_REVIEW:'美術・不確かな項目の確認待ち',READY_FOR_REVIEWED_EXPOR
    ```
  - MODIFY `使用说明.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `07526b4f8b2e52c63d6582ce0b6112c2992daaab008a76dfce7b2a77fcf16c17`; after `7f1c9f4b4c0469269a6fcf0aa389900738c929d2ea5167f7697b6a5718203f2d`
  - ADD `启动工具.cmd`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `None`; after `d5f37363e5cc195c6149d24b92c97ea5146e4cb716cb0bffd56d91730ca39d68`
  - MODIFY `文件分类与发布说明.md`; location `operator instructions / launcher`; lines `n/a`; reason: 同仓原Spine/贴图与实际参考路径对齐；用户确认保留启动器、本人登录配置与界面，并要求完整说明范围。
    - SHA256: before `b9abc1241810a0f9342c0b1ace2dbcf0417a5ec08aedcd78cceab86050890b20`; after `e3195ac5bb86067aa5232fc5dd505300158f41e454120d83f3955df681319571`
  - MODIFY `releases/spine-skin-tool-0.1.0-20261104.zip`; location `429-file bundle and embedded SHA manifest`; lines `n/a`; reason: 同步现有下载路径为含原参考的当前ZIP，不携带私人数据。
    - SHA256: before `c0c8e3ff72234c1675550cc693cede263f6dd3dabd8776f05621d8e9c1c9bf89`; after `8f6f3c82198ed27d7c9583443de89ca5c0ac106b52bd33d02cf736e93f05b2e2`
- Tests (actual outcomes only):
  - `unittest test_distribution test_maintenance test_current_pipeline014 test_character_session` : `PASS` (exit `0`); evidence: 44 targeted tests /48.816 seconds before final labels/UI reset consistency fixes; superseded by final full regression.
  - `python private parallel_regression.py (final frozen source)` : `PASS` (exit `0`); evidence: 344 discovered tests, 324.656s, exact IDs/no skips/unchanged source fingerprint 9e9134e3cf2c348cb6d238ed92630672af5a138538a21ccd8e2b69ffaad2151e. Earlier superseded runs were interrupted and not claimed PASS.
  - `new same-host directory locked dependency setup + root launcher --check-only` : `PASS` (exit `0`); evidence: No parent library or private reference import. Repository references selected; native .cmd check returned READY with own CLI ChatGPT login and0 model calls. Not a fresh Windows-machine or real paid generation test.
  - `node scripts/check_preview.cjs http://127.0.0.1:8784` : `PASS` (exit `0`); evidence: Independent actual Runtime:24 motion samples,11 original skins,0 browser errors.
  - `headless UI configured subscription/new character/synthetic import/plan/cancel request` : `PASS` (exit `0`); evidence: Subscription checked initially and for new character; synthetic PNG import, off-line plan and CANCEL_REQUESTED recorded; all reservation counters0, no advance/model request, no final page/HTTP errors. Cancel request is not a completed CANCELLED phase.
  - `initial private browser assertions` : `FAIL` (exit `1`); evidence: QA script first tried hidden collapsed control, then read hidden pre with innerText, then incorrectly expected cancellation status projection. Script corrected to use visible controls/textContent and real cancellation response/marker; no application pass inferred from failed checks.
  - `original archive comparison / license /39 runtime assets /429-member release SHA checks` : `PASS` (exit `0`); evidence: All199 original archive files copied unchanged;221 reference/template files pinned, license retained. All429 package members verified, credentials/photos/generated characters/session data excluded. Image license permits accompanied noncommercial redistribution; project file public domain as stated in original license. Editor itself not installed/tested.
  - `parent/model-reservation/user-material boundaries` : `PASS` (exit `0`); evidence: 5 parent files,299 existing reservations,four characters original raw parts/base manifests unchanged.0 new model calls.
- Risks: M08既有用户验收COMPLETE保持；本次没有新增真实生图或Editor打开测试。; 贴图只按原许可证参考/非商用；不宣称商用许可。; 环境仍需一次准备，必须本人账号具备CLI/ImageGen权限；启动不等于无限订阅或任意照片必成功。; 照片、生成角色、API配置、订阅凭证/会话不提交，旧预算/预留不清零。
- Next task: 仅提交上述已说明版本；按现有工具制作，后续功能另外沟通。

### 2026-11-05T19:19:12+09:00 | TASK-CHROME-CAPTURE | 20261105T101912Z-TASK-CHROME-CAPTURE | COMPLETE
- UTC: 2026-11-05T10:19:12+00:00
- Goal: 支持使用本机 Chrome 执行既有 Spine 动作图证，保留 Edge 默认值并拒绝未知浏览器。
- Files and corresponding code/sections:
  - MODIFY `scripts/capture_review.cjs`; location `main`; lines `13-14`; reason: 动作图证允许明确选择 Chrome，同时验证浏览器白名单。
    - SHA256: before `d4f3a2d3df308881a4fadf38c4e64663ce4eddd47b5aa6dfd05896c579be8292`; after `a2083afb16f9adbf59db80e1de30f332d19dabf61deee040ad31c79b93ab146a`
    ```text
 const channel=process.env.AI_CITY_SPINE_BROWSER||'msedge';assert(['msedge','chrome'].includes(channel),'UNSUPPORTED_BROWSER_CHANNEL');
    ```
  - MODIFY `scripts/check_preview.cjs`; location `main`; lines `8-9`; reason: 预览回归使用同一浏览器选项并拒绝未知值。
    - SHA256: before `37d14dcfdb8988e22aa9365b88066c23fd442d5fd89b1af83ad9c3e84e36eb23`; after `9c61b153db67e8ac5d5a895f6bd526ec4f7ec70aecfcd8c98c9ba0fccaaae735`
    ```text
 const channel=process.env.AI_CITY_SPINE_BROWSER||'msedge';if(!['msedge','chrome'].includes(channel))throw Error('UNSUPPORTED_BROWSER_CHANNEL');
    ```
  - MODIFY `使用说明.md`; location `1. 新环境准备`; lines `n/a`; reason: 说明本机 Chrome 选项与默认 Edge 行为。
    - SHA256: before `7f1c9f4b4c0469269a6fcf0aa389900738c929d2ea5167f7697b6a5718203f2d`; after `051f938b2b6416835d30d0f41b1fee39b36bbc92ac0b84aef94bdff4cda475c5`
- Tests (actual outcomes only):
  - `AI_CITY_SPINE_BROWSER=chrome node scripts/check_preview.cjs http://127.0.0.1:18784` : `PASS` (exit `0`); evidence: Chrome 157: 24 samples, 11 skins, zero browser errors; official reference, no model calls.
  - `AI_CITY_SPINE_BROWSER=chrome node scripts/capture_review.cjs <synthetic-config>` : `PASS` (exit `0`); evidence: Official reference bundle, same bundle at three view scales: 246 frames, zero errors; no model calls.
  - `PowerShell assertion: unsupported AI_CITY_SPINE_BROWSER is rejected` : `PASS` (exit `0`); evidence: Assertion succeeded: child exited 1 and emitted UNSUPPORTED_BROWSER_CHANNEL before launch.
- Risks: Default Edge unavailable on this machine; default Edge path not tested. Three-scale test reused one reference bundle and does not validate production texture sizes.; Actual photo candidate remains hard-failed and is not quality approved.
- Next task: Integrate the isolated tool task with a durable, consent-bound worker and verified output.
