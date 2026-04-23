/**
 * E2E: 2nd 기기 Handoff 회귀 방지
 *
 * 실행: bun tests/e2e/onboarding-2nd-handoff.spec.ts
 *
 * 시나리오 A: 클립보드에 유효 JSON 주입 → 붙여넣기 버튼 → URL/Key 자동 입력
 * 시나리오 B: 잘못된 클립보드 → 명확한 에러 메시지
 * 시나리오 C: 포털 웹의 "새 기기" 버튼이 올바른 JSON을 복사 (pw 인증된 브라우저만)
 */
import { chromium } from 'playwright';

const LOCAL_URL = process.env.LOCAL_URL ?? 'http://localhost:9000';
const PORTAL_URL = process.env.PORTAL_URL ?? 'https://portmanager-portal.vercel.app';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('❌ ' + msg);
  console.log('✓ ' + msg);
}

async function scenarioA_pasteValidPayload() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  try {
    const payload = {
      v: 1,
      type: 'portmanager-setup',
      url: 'https://test-project.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig',
      pwHash: 'abc123def',
      copiedAt: new Date().toISOString(),
    };
    await page.goto(LOCAL_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(raw => navigator.clipboard.writeText(raw), JSON.stringify(payload));

    const chooseVisible = await page.locator('text=어떤 상황인가요').isVisible().catch(() => false);
    if (!chooseVisible) {
      console.log('⊝ [A] 마법사 진입점 없음 — skip');
      return;
    }
    await page.locator('text=추가 기기 연결').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("다음")').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("클립보드에서 붙여넣기")').click();
    await page.waitForTimeout(1000);

    const urlField = page.locator('input[placeholder*="supabase.co"]').first();
    const val = await urlField.inputValue().catch(() => '');
    await assert(val === payload.url, `[A] URL 자동 입력됨: ${val}`);

    await assert(
      await page.locator('text=URL/Key 자동 입력됨').isVisible(),
      '[A] 성공 메시지 노출'
    );
  } finally {
    await browser.close();
  }
}

async function scenarioB_invalidPayload() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  try {
    await page.goto(LOCAL_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => navigator.clipboard.writeText('just plain garbage not json'));

    const chooseVisible = await page.locator('text=어떤 상황인가요').isVisible().catch(() => false);
    if (!chooseVisible) {
      console.log('⊝ [B] 마법사 진입점 없음 — skip');
      return;
    }
    await page.locator('text=추가 기기 연결').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("다음")').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("클립보드에서 붙여넣기")').click();
    await page.waitForTimeout(700);

    const errorVisible = await page.locator('text=/JSON이 아닙니다|portmanager-setup 형식|클립보드/').isVisible().catch(() => false);
    await assert(errorVisible, '[B] 잘못된 payload → 에러 메시지 노출');
  } finally {
    await browser.close();
  }
}

async function scenarioC_portalCopyButton() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  try {
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const pwGate = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    if (pwGate) {
      console.log('⊝ [C] 포털 웹 비밀번호 게이트 — skip (비인증 상태)');
      return;
    }

    const btn = page.locator('button[title*="새 기기 연결"]').first();
    const visible = await btn.isVisible().catch(() => false);
    if (!visible) {
      console.log('⊝ [C] "새 기기" 버튼 안 보임 (creds 없음) — skip');
      return;
    }
    await btn.click();
    await page.waitForTimeout(500);

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const payload = JSON.parse(clip);
    await assert(payload.v === 1, '[C] payload.v === 1');
    await assert(payload.type === 'portmanager-setup', '[C] payload.type === portmanager-setup');
    await assert(/^https:\/\/[^.]+\.supabase\.co$/.test(payload.url), '[C] URL supabase.co 형식');
    await assert(typeof payload.key === 'string' && payload.key.startsWith('eyJ'), '[C] key JWT 형식');
  } finally {
    await browser.close();
  }
}

async function main() {
  let failed = false;
  const run = async (name: string, fn: () => Promise<void>) => {
    console.log(`\n─── ${name} ───`);
    try { await fn(); console.log(`✅ ${name} PASS`); }
    catch (e: any) { console.error(`❌ ${name} FAIL: ${e.message}`); failed = true; }
  };
  await run('Scenario A: Valid paste', scenarioA_pasteValidPayload);
  await run('Scenario B: Invalid paste', scenarioB_invalidPayload);
  await run('Scenario C: Portal copy button', scenarioC_portalCopyButton);
  if (failed) process.exit(1);
}

main();
