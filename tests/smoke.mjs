/**
 * 스모크 테스트 — 핵심 경로만 빠르게 확인.
 * 사용: `node tests/smoke.mjs`
 *
 * 옵션 환경변수:
 *   TARGET=local   → http://localhost:9001 (기본)  — 로컬 App.tsx 전체 (ports + portal)
 *   TARGET=vercel  → https://portmanager-portal.vercel.app — 포털 전용
 *   TARGET=<url>   → 임의 URL (자동 감지)
 *   VIEWPORT=mobile → 375x812 (iPhone SE 세로)
 */
import { chromium } from 'playwright';

const TARGET = process.env.TARGET === 'vercel'
  ? 'https://portmanager-portal.vercel.app'
  : process.env.TARGET && process.env.TARGET.startsWith('http')
    ? process.env.TARGET
    : 'http://localhost:9001';

const isVercelPortal = TARGET.includes('portmanager-portal.vercel.app');
const isLocalFullApp = TARGET.startsWith('http://localhost');
const isMobileViewport = process.env.VIEWPORT === 'mobile';
const viewport = isMobileViewport ? { width: 375, height: 812 } : { width: 1280, height: 800 };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  console.log(`\n▶ Smoke test against ${TARGET} (${viewport.width}x${viewport.height})\n`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport, isMobile: isMobileViewport });
  const page = await ctx.newPage();

  try {
    const res = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 20000 });
    check('page loads 2xx/3xx', !!res && res.status() < 400, `status ${res?.status()}`);

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // 가로 오버플로우 체크 — scrollWidth > clientWidth 면 UI 잘림
    if (isMobileViewport) {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      check(
        `Mobile: 가로 오버플로우 없음 (scrollWidth ${overflow.scrollWidth} ≤ clientWidth ${overflow.clientWidth})`,
        overflow.scrollWidth <= overflow.clientWidth + 1, // 1px 여유
      );
    }
    const bodyText = await page.locator('body').innerText().catch(() => '');

    if (isVercelPortal) {
      // Vercel deployment = portal-main.tsx only (북마크 전용 앱, 비밀번호 가드 가능)
      const passwordGate = bodyText.includes('비밀번호') && bodyText.includes('입장');
      if (passwordGate) {
        check('Vercel: 비밀번호 게이트 정상 렌더', true, '비밀번호 보호 활성');
        check('Vercel: "프로젝트 추가" 버튼 없음 (포털 전용)',
          await page.getByRole('button', { name: /프로젝트 추가/ }).count() === 0);
      } else {
        check('Vercel: 북마크 헤더 노출', bodyText.includes('북마크') || bodyText.includes('Bookmarks'));
        check('Vercel: "프로젝트 추가" 버튼 없음 (포털 전용)',
          await page.getByRole('button', { name: /프로젝트 추가/ }).count() === 0);
      }
    } else if (isLocalFullApp) {
      const addBtn = await page.getByRole('button', { name: /프로젝트 추가/ }).count();
      check('Local: 프로젝트 추가 버튼 노출', addBtn > 0);

      if (addBtn > 0) {
        await page.getByRole('button', { name: /프로젝트 추가/ }).first().click();
        await page.waitForTimeout(500);
        check('Local: "기존 폴더 연결" 탭', await page.getByRole('button', { name: /기존 폴더 연결/ }).count() > 0);
        check('Local: "새 폴더 만들기" 탭', await page.getByRole('button', { name: /새 폴더 만들기/ }).count() > 0);
        await page.getByRole('button', { name: /새 폴더 만들기/ }).click();
        await page.waitForTimeout(300);
        const bodyAfter = await page.locator('body').innerText();
        const hasRootUi = bodyAfter.includes('작업루트') || bodyAfter.includes('작업 루트');
        check('Local: 새 폴더 탭에서 작업루트 가이드 노출', hasRootUi);
        await page.keyboard.press('Escape').catch(() => {});
      }

      // api-server health
      try {
        const apiRes = await page.request.get('http://localhost:3001/api/ports');
        check('Local: api-server /api/ports 응답', apiRes.status() === 200);
      } catch {
        check('Local: api-server /api/ports 응답', false, 'api-server not running');
      }
    } else {
      check(`unknown target ${TARGET}`, true, 'skipping mode-specific checks');
    }
  } catch (e) {
    check('no exceptions during smoke', false, e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nResult: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach(f => console.log(`  - ${f.name} (${f.detail})`));
    process.exit(1);
  }
})();
