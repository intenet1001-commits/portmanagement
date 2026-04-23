import React, { useState, useEffect } from 'react';
import {
  Check, Copy, ChevronRight, Terminal, Database, Server,
  Globe, ArrowRight, ExternalLink, Laptop, Plus, RefreshCw, Monitor, Zap,
  ClipboardPaste, Link2,
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: (config: { supabaseUrl: string; supabaseAnonKey: string; deviceName: string }) => void;
  onSkip: () => void;
}

type Mode = 'choose' | 'first' | 'additional' | 'portal' | 'windows_env' | 'mac_env' | 'dev_env';
type OS = 'mac' | 'windows';

// ─── CLI Auto-fill Component ──────────────────────────────────────────────────

type CliStatus = 'loading' | 'not_installed' | 'not_logged_in' | 'ready' | 'error';

function CliAutoFill({ onFill }: { onFill: (url: string, key: string) => void }) {
  const [status, setStatus] = useState<CliStatus>('loading');
  const [projects, setProjects] = useState<{ ref: string; name: string; region: string }[]>([]);
  const [selectedRef, setSelectedRef] = useState('');
  const [fetching, setFetching] = useState(false);
  const [filled, setFilled] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [loginCmd, setLoginCmd] = useState('supabase login');

  function loadStatus() {
    setStatus('loading');
    fetch('/api/supabase-cli/status')
      .then(r => r.json())
      .then(data => {
        if (data.loginCmd) setLoginCmd(data.loginCmd);
        if (!data.installed) return setStatus('not_installed');
        if (!data.loggedIn) return setStatus('not_logged_in');
        setProjects(data.projects ?? []);
        if (data.projects?.length === 1) setSelectedRef(data.projects[0].ref);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }

  useEffect(() => { loadStatus(); }, []);

  async function handleAutoFill() {
    if (!selectedRef) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/supabase-cli/apikeys?ref=${selectedRef}`);
      const data = await res.json();
      if (data.anonKey) {
        onFill(data.projectUrl, data.anonKey);
        setFilled(true);
      } else {
        setFetchError(data.error === 'no_token' ? 'CLI 로그인 토큰을 찾을 수 없습니다. supabase login을 실행해주세요.' : 'Anon Key를 가져오지 못했습니다.');
      }
    } catch {
      setFetchError('네트워크 오류');
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      filled ? 'bg-green-500/5 border-green-500/30' : 'bg-violet-500/5 border-violet-500/20'
    }`}>
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-sm font-semibold text-violet-300">CLI 자동 가져오기</span>
        {status === 'loading' && <RefreshCw className="w-3.5 h-3.5 text-zinc-500 animate-spin ml-auto" />}
        {status === 'ready' && !filled && <span className="ml-auto text-[10px] text-green-400 font-medium">✓ CLI 인증됨</span>}
        {filled && <span className="ml-auto text-[10px] text-green-400 font-medium">✓ 자동 입력 완료</span>}
      </div>

      {status === 'loading' && (
        <p className="text-xs text-zinc-500">CLI 상태 확인 중…</p>
      )}

      {status === 'not_installed' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">Supabase CLI가 설치되어 있지 않습니다.</p>
          <div className="bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-xs text-emerald-300 flex items-center justify-between">
            <span>{loginCmd}</span>
            <button onClick={() => navigator.clipboard.writeText(loginCmd)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors ml-3">
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-600">터미널에서 위 명령 실행 후 아래 버튼을 누르세요.</p>
          <button onClick={loadStatus} className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors underline">
            상태 다시 확인
          </button>
        </div>
      )}

      {status === 'not_logged_in' && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">CLI 설치됨, 로그인이 필요합니다.</p>
          <div className="bg-black/40 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-xs text-emerald-300 flex items-center justify-between">
            <span>{loginCmd}</span>
            <button onClick={() => navigator.clipboard.writeText(loginCmd)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors ml-3">
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-zinc-600">터미널에서 위 명령 실행 후 아래 버튼을 누르세요.</p>
          <button onClick={loadStatus} className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors underline">
            상태 다시 확인
          </button>
        </div>
      )}

      {status === 'ready' && !filled && (
        <div className="space-y-2">
          <label className="block text-[11px] text-zinc-500">프로젝트 선택</label>
          <div className="flex gap-2">
            <select
              value={selectedRef}
              onChange={e => setSelectedRef(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500">
              <option value="">— 프로젝트 선택 —</option>
              {projects.map(p => (
                <option key={p.ref} value={p.ref}>{p.name} ({p.ref})</option>
              ))}
            </select>
            <button
              onClick={handleAutoFill}
              disabled={!selectedRef || fetching}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap">
              {fetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {fetching ? '가져오는 중…' : '자동 입력'}
            </button>
          </div>
          {fetchError && <p className="text-xs text-red-400">{fetchError}</p>}
        </div>
      )}

      {filled && (
        <p className="text-xs text-green-300">URL과 Anon Key가 자동으로 입력되었습니다. 아래에서 확인하세요.</p>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function OsToggle({ os, onChange }: { os: OS; onChange: (os: OS) => void }) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1 w-fit mb-4">
      <button onClick={() => onChange('mac')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${os === 'mac' ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
        🍎 macOS
      </button>
      <button onClick={() => onChange('windows')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${os === 'windows' ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
        🪟 Windows
      </button>
    </div>
  );
}

function CodeBlock({ code, label, comment }: { code: string; label?: string; comment?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="text-[10px] text-zinc-500 mb-1 font-medium">{label}</p>}
      <div className="bg-black/60 border border-zinc-700/80 rounded-lg px-4 py-3 font-mono text-sm text-emerald-300 flex items-start justify-between gap-3">
        <pre className="whitespace-pre-wrap break-all leading-relaxed flex-1">{code}</pre>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="shrink-0 p-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded transition-all mt-0.5" title="복사">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
        </button>
      </div>
      {comment && <p className="text-[10px] text-zinc-600 mt-1">{comment}</p>}
    </div>
  );
}

function InfoBox({ children, color = 'zinc' }: { children: React.ReactNode; color?: 'zinc' | 'blue' | 'amber' | 'green' }) {
  const colors = {
    zinc: 'bg-zinc-900 border-zinc-700 text-zinc-400',
    blue: 'bg-blue-500/5 border-blue-500/20 text-blue-300',
    amber: 'bg-amber-500/5 border-amber-500/20 text-amber-300',
    green: 'bg-green-500/5 border-green-500/20 text-green-300',
  };
  return <div className={`border rounded-xl p-4 text-sm ${colors[color]}`}>{children}</div>;
}

function StepDot({ num, active, done }: { num: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
      done ? 'bg-green-500/20 border-2 border-green-500 text-green-400'
      : active ? 'bg-blue-500/20 border-2 border-blue-400 text-blue-300'
      : 'bg-zinc-800 border border-zinc-600 text-zinc-500'
    }`}>
      {done ? <Check className="w-4 h-4" /> : num}
    </div>
  );
}

// ─── Migration SQL ─────────────────────────────────────────────────────────────

const MIGRATION_SQL = `create table if not exists ports (
  id text primary key,
  device_id text,
  device_name text,
  name text not null,
  port integer,
  command_path text,
  terminal_command text,
  folder_path text,
  deploy_url text,
  github_url text,
  category text,
  description text,
  ai_name text
);
alter table ports add column if not exists device_id text;
alter table ports add column if not exists device_name text;
create index if not exists idx_ports_device_id on ports(device_id);

create table if not exists workspace_roots (
  id text primary key,
  device_id text not null,
  name text not null,
  path text not null
);

create table if not exists portal_items (
  id text primary key,
  device_id text not null,
  name text not null,
  type text not null,
  url text,
  path text,
  category text not null,
  description text,
  pinned boolean default false,
  visit_count integer default 0,
  last_visited text,
  created_at text not null
);
create index if not exists idx_portal_items_device_id on portal_items(device_id);

create table if not exists portal_categories (
  id text primary key,
  device_id text not null,
  name text not null,
  color text not null,
  "order" integer default 0
);

alter table ports disable row level security;
alter table workspace_roots disable row level security;
alter table portal_items disable row level security;
alter table portal_categories disable row level security;`;

// ─── First-time Setup ──────────────────────────────────────────────────────────

function FirstSetupWizard({ onComplete, onBack }: { onComplete: SetupWizardProps['onComplete']; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [os, setOs] = useState<OS>('mac');
  const [orgId, setOrgId] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [refId, setRefId] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testing, setTesting] = useState(false);
  const [cliReady, setCliReady] = useState(false);

  // 앱 진입 시 CLI 인증 여부 자동 확인 → 이미 준비된 경우 스킵 안내
  useEffect(() => {
    fetch('/api/supabase-cli/status').then(r => r.json()).then(d => {
      if (d.installed && d.loggedIn) setCliReady(true);
    }).catch(() => {});
  }, []);

  // refId → URL 자동 완성
  React.useEffect(() => {
    if (refId) setSupabaseUrl(`https://${refId}.supabase.co`);
  }, [refId]);

  async function testConnection() {
    if (!supabaseUrl || !supabaseAnonKey) return;
    setTesting(true); setTestResult('idle');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { error } = await createClient(supabaseUrl, supabaseAnonKey).from('ports').select('id').limit(1);
      setTestResult(error ? 'fail' : 'ok');
    } catch { setTestResult('fail'); } finally { setTesting(false); }
  }

  const steps = [
    { title: 'Supabase 가입' },
    { title: 'CLI 설치 & 로그인' },
    { title: '프로젝트 생성' },
    { title: '프로젝트 연결' },
    { title: '테이블 생성' },
    { title: 'API Key 가져오기' },
    { title: '연결 확인' },
    { title: '이 기기 이름' },
  ];

  const cliInstall = os === 'mac'
    ? 'brew install supabase/tap/supabase'
    : `# 방법 1: Scoop (권장)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 방법 2: npm
npm install -g supabase`;

  const createProjectCmd = os === 'mac'
    ? `# 1. Org ID 확인\nsupabase orgs list\n\n# 2. 프로젝트 생성\nsupabase projects create portmanagement \\\n  --org-id <YOUR_ORG_ID> \\\n  --db-password <원하는_비밀번호> \\\n  --region ap-northeast-1`
    : `# 1. Org ID 확인\nsupabase orgs list\n\n# 2. 프로젝트 생성 (PowerShell — 백틱으로 줄 이음)\nsupabase projects create portmanagement \`\n  --org-id <YOUR_ORG_ID> \`\n  --db-password <원하는_비밀번호> \`\n  --region ap-northeast-1`;

  const stepContent = [
    // 0: 가입
    <div key={0} className="space-y-4">
      {cliReady && (
        <InfoBox color="green">
          <p className="font-semibold mb-1">✅ Supabase CLI 인증 확인됨</p>
          <p className="text-xs text-green-200">CLI가 이미 설치·로그인되어 있습니다. Step 1~2를 건너뛰고 <strong>Step 3 (프로젝트 생성)</strong>으로 바로 이동하거나, API Key 단계에서 자동 입력을 사용하세요.</p>
        </InfoBox>
      )}
      <p className="text-zinc-400 text-sm">Supabase는 무료 PostgreSQL 호스팅으로, 여러 기기 간 데이터 동기화에 사용합니다.</p>
      <InfoBox color="blue">
        <p className="font-semibold mb-2">가입 방법</p>
        <ol className="list-decimal list-inside space-y-1.5 text-sm">
          <li><a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-blue-300 underline">supabase.com</a> 접속</li>
          <li><span className="font-medium text-white">Start your project</span> 클릭</li>
          <li>GitHub 계정으로 로그인 (권장) 또는 이메일</li>
          <li>이메일 인증 완료</li>
        </ol>
      </InfoBox>
      <InfoBox>
        <p className="text-zinc-300 text-xs">💡 Free tier: 500MB DB, 월 50,000 API 요청 — 개인/소규모 팀에 충분합니다.</p>
      </InfoBox>
    </div>,

    // 1: CLI 설치
    <div key={1} className="space-y-4">
      {cliReady ? (
        <InfoBox color="green">
          <p className="font-semibold">✅ 이미 설치·로그인됨 — 이 단계를 건너뛰어도 됩니다</p>
        </InfoBox>
      ) : (
        <p className="text-zinc-400 text-sm">Supabase CLI로 프로젝트 생성부터 테이블 생성까지 모두 터미널에서 처리합니다.</p>
      )}
      <OsToggle os={os} onChange={setOs} />
      {os === 'mac' && (
        <>
          <CodeBlock label="방법 1: Homebrew (권장)" code="brew install supabase/tap/supabase" />
          <CodeBlock label="방법 2: Homebrew 없는 경우" code={`curl -L https://github.com/supabase/cli/releases/latest/download/supabase_darwin_amd64.tar.gz -o /tmp/supabase.tar.gz\ntar -xzf /tmp/supabase.tar.gz -C /tmp\nmkdir -p ~/.local/bin && mv /tmp/supabase ~/.local/bin/supabase`} />
        </>
      )}
      {os === 'windows' && (
        <>
          <InfoBox color="blue">
            <p className="text-xs font-semibold mb-2">① Scoop 패키지 매니저 설치 (없는 경우)</p>
            <p className="text-xs text-blue-200 mb-2">PowerShell을 <strong>관리자 권한</strong>으로 열고 실행:</p>
            <div className="bg-black/40 rounded px-3 py-2 font-mono text-xs text-emerald-300 flex items-center justify-between">
              <span>Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm get.scoop.sh | iex</span>
              <button onClick={() => navigator.clipboard.writeText('Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; irm get.scoop.sh | iex')} className="text-zinc-500 hover:text-zinc-300 ml-2 shrink-0"><Copy className="w-3 h-3" /></button>
            </div>
            <p className="text-[10px] text-blue-300 mt-1">설치 후 새 PowerShell 창을 열어야 <code>scoop</code>이 인식됩니다.</p>
          </InfoBox>
          <CodeBlock label="② Supabase CLI 설치 (Scoop)" code={`scoop bucket add supabase https://github.com/supabase/scoop-bucket.git\nscoop install supabase`} />
          <CodeBlock label="또는: Scoop 없이 직접 설치" code={`irm https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.zip -OutFile supabase.zip\nExpand-Archive supabase.zip -DestinationPath supabase-cli\nMove-Item supabase-cli\\supabase.exe C:\\Windows\\System32\\`} comment="PowerShell 관리자 권한으로 실행" />
          <InfoBox color="amber">
            <p className="text-xs">⚠️ 설치 후 반드시 <strong>새 PowerShell 창</strong>을 열어야 명령이 인식됩니다.</p>
          </InfoBox>
        </>
      )}
      <CodeBlock label="버전 확인" code="supabase --version" comment="1.x 이상이면 정상" />
      <CodeBlock label="로그인 (브라우저 인증)" code="supabase login" comment="브라우저가 열리면 Supabase 계정으로 인증 완료 후 돌아오세요" />
    </div>,

    // 2: 프로젝트 생성
    <div key={2} className="space-y-4">
      <p className="text-zinc-400 text-sm">CLI로 Supabase 프로젝트를 생성합니다.</p>
      <OsToggle os={os} onChange={setOs} />
      <CodeBlock label="Org ID 확인 + 프로젝트 생성" code={createProjectCmd} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Org ID (위 결과에서 복사)</label>
          <input value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="예: abcorg123"
            className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">DB Password (직접 설정)</label>
          <input value={dbPassword} onChange={e => setDbPassword(e.target.value)} type="password" placeholder="강력한 비밀번호"
            className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      </div>
      {orgId && dbPassword && (
        <CodeBlock label="복사해서 바로 실행" code={`supabase projects create portmanagement --org-id ${orgId} --db-password "${dbPassword}" --region ap-northeast-1`} />
      )}
      <InfoBox>
        <p className="text-xs text-zinc-400">실행 결과에서 <code className="text-violet-300">Project Ref</code> 값을 복사해두세요. 다음 단계에서 필요합니다.</p>
      </InfoBox>
    </div>,

    // 3: 프로젝트 연결
    <div key={3} className="space-y-4">
      <p className="text-zinc-400 text-sm">생성된 프로젝트를 현재 디렉토리에 연결합니다.</p>
      <div>
        <label className="block text-xs text-zinc-500 mb-1">Project Ref (이전 단계 결과)</label>
        <input value={refId} onChange={e => setRefId(e.target.value)} placeholder="예: abcdefghijklmno"
          className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono" />
      </div>
      {refId && (
        <>
          <CodeBlock label="프로젝트 연결" code={`supabase link --project-ref ${refId}`} comment={`DB 비밀번호 입력 요청 시 → "${dbPassword || '<설정한 비밀번호>'}" 입력`} />
          <InfoBox color="green">
            <p className="text-xs">Project URL이 자동 설정됩니다: <code className="text-white">https://{refId}.supabase.co</code></p>
          </InfoBox>
        </>
      )}
      {!refId && <InfoBox color="amber"><p className="text-xs">위에서 Project Ref를 먼저 입력하세요.</p></InfoBox>}
    </div>,

    // 4: 테이블 생성
    <div key={4} className="space-y-4">
      <p className="text-zinc-400 text-sm">마이그레이션 파일을 만들고 DB에 적용합니다.</p>
      <OsToggle os={os} onChange={setOs} />
      <CodeBlock label="1. 마이그레이션 파일 생성" code="supabase migration new init_portmanagement" comment="portmanagement 폴더 내 supabase/migrations/ 에 파일 생성됨" />
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400 space-y-2">
        <p>생성된 파일을 열고 아래 SQL을 붙여넣기:</p>
        <p className="text-zinc-600">
          경로:{' '}
          <code className="text-zinc-400">
            {os === 'mac'
              ? 'supabase/migrations/[타임스탬프]_init_portmanagement.sql'
              : 'supabase\\migrations\\[타임스탬프]_init_portmanagement.sql'}
          </code>
        </p>
        {os === 'windows' && (
          <div className="pt-1 space-y-1">
            <p className="text-zinc-500">파일 열기 (PowerShell):</p>
            <div className="bg-black/40 rounded px-3 py-1.5 font-mono text-xs text-emerald-300 flex items-center justify-between">
              <span>{'notepad (Get-ChildItem supabase\\migrations\\*.sql | Select-Object -Last 1).FullName'}</span>
              <button onClick={() => navigator.clipboard.writeText('notepad (Get-ChildItem supabase\\migrations\\*.sql | Select-Object -Last 1).FullName')} className="text-zinc-500 hover:text-zinc-300 ml-2 shrink-0"><Copy className="w-3 h-3" /></button>
            </div>
            <p className="text-[10px] text-zinc-600">또는 VS Code: <code className="text-zinc-400">code .</code> 로 폴더 열기</p>
          </div>
        )}
      </div>
      <CodeBlock label="2. SQL 내용 (파일에 붙여넣기)" code={MIGRATION_SQL} />
      <CodeBlock label="3. DB에 적용" code="supabase db push" comment="완료 시 'Finished supabase db push' 출력" />
    </div>,

    // 5: API Key
    <div key={5} className="space-y-4">
      <p className="text-zinc-400 text-sm">CLI로 API 키를 가져옵니다.</p>
      <CliAutoFill onFill={(url, key) => { setSupabaseUrl(url); setSupabaseAnonKey(key); if (!refId) { const m = url.match(/https:\/\/(.+)\.supabase\.co/); if (m) setRefId(m[1]); } }} />
      {refId
        ? <CodeBlock label="(참고) 수동 조회 명령" code={`supabase projects api-keys --project-ref ${refId}`} />
        : <InfoBox color="amber"><p className="text-xs">이전 단계에서 Project Ref를 입력하거나 위 자동 입력을 사용하세요.</p></InfoBox>
      }
      <div className="bg-black/40 border border-zinc-700 rounded-lg p-3 font-mono text-xs space-y-1">
        <p className="text-zinc-500">출력 예시:</p>
        <p><span className="text-violet-300">anon</span>     <span className="text-zinc-300">eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</span> <span className="text-green-400">← 이것 복사</span></p>
        <p><span className="text-red-400">service_role</span> <span className="text-zinc-600">eyJhbGc... ← 사용하지 말 것</span></p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Project URL <span className="text-zinc-600">(자동 입력됨)</span></label>
          <input type="text" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)}
            placeholder="https://xxx.supabase.co"
            className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Anon Key <span className="text-zinc-600">(service_role 아님)</span></label>
          <input type="password" value={supabaseAnonKey} onChange={e => setSupabaseAnonKey(e.target.value)}
            placeholder="eyJ..."
            className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
        </div>
      </div>
    </div>,

    // 6: 연결 확인
    <div key={6} className="space-y-4">
      <p className="text-zinc-400 text-sm">입력한 URL과 Key로 DB 연결을 확인합니다.</p>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Project URL</span>
          <span className="text-white font-mono text-xs truncate max-w-48">{supabaseUrl || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Anon Key</span>
          <span className="text-white font-mono text-xs">{supabaseAnonKey ? supabaseAnonKey.slice(0, 16) + '…' : '—'}</span>
        </div>
      </div>
      <button onClick={testConnection} disabled={!supabaseUrl || !supabaseAnonKey || testing}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
          testResult === 'ok' ? 'bg-green-500/10 text-green-400 border-green-500/30'
          : testResult === 'fail' ? 'bg-red-500/10 text-red-400 border-red-500/30'
          : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30 disabled:opacity-40'
        }`}>
        {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : testResult === 'ok' ? <Check className="w-4 h-4" /> : <Database className="w-4 h-4" />}
        {testing ? '연결 확인 중…' : testResult === 'ok' ? '✅ 연결 성공! 다음 단계로 진행하세요' : testResult === 'fail' ? '❌ 연결 실패 — URL/Key 재확인' : '연결 테스트'}
      </button>
      {testResult === 'fail' && (
        <>
          <InfoBox color="amber">
            <p className="text-xs space-y-1">
              <span className="block">• URL 형식: <code>https://[ref].supabase.co</code></span>
              <span className="block">• anon key 사용 여부 확인 (service_role 아님)</span>
              <span className="block">• <code>supabase db push</code>가 완료됐는지 확인</span>
            </p>
          </InfoBox>
          <button
            onClick={async () => {
              const debug = {
                timestamp: new Date().toISOString(),
                platform: navigator.platform,
                userAgent: navigator.userAgent,
                urlPrefix: supabaseUrl.slice(0, 40),
                keyPrefix: supabaseAnonKey.slice(0, 20) + '...',
                keyLength: supabaseAnonKey.length,
              };
              try { await navigator.clipboard.writeText(JSON.stringify(debug, null, 2)); }
              catch {}
            }}
            className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline"
          >
            🛠 디버그 정보 복사 (에러 공유용)
          </button>
        </>
      )}
    </div>,

    // 7: 기기 이름
    <div key={7} className="space-y-4">
      <p className="text-zinc-300">마지막으로 이 기기의 이름을 입력하세요.</p>
      <p className="text-zinc-500 text-sm">여러 기기를 사용할 때 구분하는 데 쓰입니다.</p>
      <OsToggle os={os} onChange={setOs} />
      <input type="text" value={deviceName} onChange={e => setDeviceName(e.target.value)}
        placeholder={os === 'mac' ? '예: MyMacPro, 회사맥북, 집맥미니' : '예: 회사PC, 집데스크탑, 노트북'}
        className="w-full px-4 py-3 text-base bg-black/40 border border-zinc-600 text-white placeholder-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        autoFocus />
      <div className="grid grid-cols-3 gap-2">
        {(os === 'mac'
          ? ['MyMacPro', '회사맥북', '집맥북', '맥미니', '맥스튜디오', '맥북에어']
          : ['회사PC', '집데스크탑', '노트북', '사무실PC', '게이밍PC', '미니PC']
        ).map(n => (
          <button key={n} onClick={() => setDeviceName(n)}
            className={`py-2 px-3 text-xs rounded-lg border transition-all ${deviceName === n ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}>
            {n}
          </button>
        ))}
      </div>
      {deviceName && testResult === 'ok' && (
        <InfoBox color="green">
          <p className="font-semibold mb-1">✅ 모든 설정 완료!</p>
          <p className="text-xs text-zinc-300">기기: <span className="text-white">{deviceName}</span> · Supabase: {supabaseUrl.split('.')[0].replace('https://', '')}…</p>
        </InfoBox>
      )}
    </div>,
  ];

  const canNext = [
    true,                          // 0: 가입
    true,                          // 1: CLI
    !!orgId && !!dbPassword,       // 2: 프로젝트 생성
    !!refId,                       // 3: 프로젝트 연결
    true,                          // 4: 테이블
    !!supabaseUrl && !!supabaseAnonKey, // 5: API Key
    testResult === 'ok',           // 6: 연결 확인
    !!deviceName,                  // 7: 기기 이름
  ];

  return (
    <WizardLayout
      title="최초 세팅"
      progressColor="blue"
      steps={steps}
      step={step}
      setStep={setStep}
      canNext={canNext}
      onBack={onBack}
      onComplete={() => onComplete({ supabaseUrl, supabaseAnonKey, deviceName })}
      canComplete={!!deviceName && testResult === 'ok'}
    >
      {stepContent[step]}
    </WizardLayout>
  );
}

// ─── Additional Device Wizard ──────────────────────────────────────────────────

function AdditionalDeviceWizard({ onComplete, onBack }: { onComplete: SetupWizardProps['onComplete']; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [os, setOs] = useState<OS>('mac');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testing, setTesting] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pasteMessage, setPasteMessage] = useState('');
  const [pwHashFromPaste, setPwHashFromPaste] = useState('');

  async function testConnection(url?: string, key?: string) {
    const u = url ?? supabaseUrl;
    const k = key ?? supabaseAnonKey;
    if (!u || !k) return;
    setTesting(true); setTestResult('idle');
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { error } = await createClient(u, k).from('ports').select('id').limit(1);
      setTestResult(error ? 'fail' : 'ok');
    } catch { setTestResult('fail'); } finally { setTesting(false); }
  }

  async function handlePasteSetup() {
    setPasteStatus('idle'); setPasteMessage('');
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw.trim()) throw new Error('클립보드가 비어있습니다');
      let payload: any;
      try { payload = JSON.parse(raw); }
      catch { throw new Error('클립보드 내용이 JSON이 아닙니다'); }

      if (payload.v !== 1 || payload.type !== 'portmanager-setup') {
        throw new Error('portmanager-setup 형식이 아닙니다');
      }
      if (!payload.url || !/^https:\/\/[^.]+\.supabase\.co$/.test(payload.url)) {
        throw new Error('URL 형식이 잘못되었습니다');
      }
      if (!payload.key || !payload.key.startsWith('eyJ')) {
        throw new Error('Anon Key 형식이 잘못되었습니다');
      }

      setSupabaseUrl(payload.url);
      setSupabaseAnonKey(payload.key);
      if (payload.pwHash) setPwHashFromPaste(payload.pwHash);
      setPasteStatus('success');
      setPasteMessage('✓ URL/Key 자동 입력됨 — 연결 테스트 자동 실행');
      // 자동 연결 테스트
      void testConnection(payload.url, payload.key);
    } catch (e: any) {
      setPasteStatus('error');
      setPasteMessage('❌ ' + (e?.message ?? e) + ' — 포털 웹에서 "새 기기" 버튼을 다시 누르세요');
    }
  }

  const steps = [
    { title: '코드 받기 & 실행' },
    { title: 'URL & Key 입력' },
    { title: '이 기기 이름' },
  ];

  const cloneCmd = os === 'mac'
    ? `git clone https://github.com/intenet1001-commits/portmanagement.git
cd portmanagement
bun install
bun run start`
    : `git clone https://github.com/intenet1001-commits/portmanagement.git
cd portmanagement
# Bun 설치 (없는 경우): https://bun.sh
bun install
bun run start`;

  const stepContent = [
    <div key={0} className="space-y-4">
      <p className="text-zinc-400 text-sm">동일한 코드를 이 기기에 설치합니다.</p>
      <OsToggle os={os} onChange={setOs} />

      {os === 'windows' && (
        <div className="space-y-3">
          <CodeBlock label="① Bun 설치 (없는 경우)" code={`powershell -c "irm bun.sh/install.ps1 | iex"`} comment="PowerShell에서 실행, 설치 후 새 터미널 창 열기" />
          <CodeBlock label="② Git 설치 (없는 경우)" code="winget install Git.Git" comment="또는 https://git-scm.com 에서 다운로드" />
        </div>
      )}
      {os === 'mac' && (
        <div className="space-y-3">
          <CodeBlock label="① Bun 설치 (없는 경우)" code={`curl -fsSL https://bun.sh/install | bash`} comment="이미 있으면 건너뛰기" />
        </div>
      )}

      <CodeBlock label={os === 'windows' ? '③ 저장소 클론 & 실행 (PowerShell)' : '② 저장소 클론 & 실행'} code={cloneCmd} />

      {os === 'mac' && (
        <CodeBlock label="또는: 이미 폴더가 있는 경우" code={`cd portmanagement\ngit pull\nbun run start`} />
      )}
      {os === 'windows' && (
        <CodeBlock label="또는: 이미 폴더가 있는 경우" code={`cd portmanagement\ngit pull\nbun run start`} />
      )}

      <InfoBox>
        <p className="text-xs text-zinc-400">
          실행 후 브라우저에서 <code className="text-emerald-400">http://localhost:9000</code> 접속
          {os === 'windows' && ' — 방화벽 허용 팝업이 뜨면 허용을 클릭하세요'}
        </p>
      </InfoBox>
    </div>,

    <div key={1} className="space-y-4">
      <p className="text-zinc-400 text-sm">기존 기기와 동일한 Supabase URL + Anon Key를 입력하세요.</p>

      {/* ★ Handoff: 포털 웹에서 복사한 설정 붙여넣기 (가장 쉬운 방법) */}
      <div className="border-2 border-blue-500/40 bg-blue-500/5 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-400" />
          <p className="text-sm font-semibold text-blue-300">1st 기기 설정 붙여넣기 (가장 쉬움)</p>
        </div>
        <p className="text-xs text-zinc-400">1st 기기의 포털 웹사이트에서 <span className="text-blue-300">"새 기기"</span> 버튼을 눌러 설정을 복사한 뒤, 아래 버튼을 누르세요.</p>
        <button
          onClick={handlePasteSetup}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/40"
        >
          <ClipboardPaste className="w-4 h-4" />클립보드에서 붙여넣기
        </button>
        {pasteStatus !== 'idle' && (
          <p className={`text-xs mt-1 ${pasteStatus === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {pasteMessage}
          </p>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
        <div className="relative flex justify-center"><span className="px-3 text-[10px] text-zinc-600 bg-[#0a0a0b]">또는 수동 입력</span></div>
      </div>

      <CliAutoFill onFill={(url, key) => { setSupabaseUrl(url); setSupabaseAnonKey(key); }} />
      <InfoBox color="amber">
        <p className="text-xs">💡 CLI가 없거나 1st 기기 포털에 접근할 수 없다면: 기존 기기의 상단 ⚙ → Project URL + Anon Key 복사</p>
      </InfoBox>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Project URL</label>
        <input type="text" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} placeholder="https://xxx.supabase.co"
          className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Anon Key</label>
        <input type="password" value={supabaseAnonKey} onChange={e => setSupabaseAnonKey(e.target.value)} placeholder="eyJ..."
          className="w-full px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono" />
      </div>
      <button onClick={() => testConnection()} disabled={!supabaseUrl || !supabaseAnonKey || testing}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
          testResult === 'ok' ? 'bg-green-500/10 text-green-400 border-green-500/30'
          : testResult === 'fail' ? 'bg-red-500/10 text-red-400 border-red-500/30'
          : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30 disabled:opacity-40'
        }`}>
        {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : testResult === 'ok' ? <Check className="w-4 h-4" /> : <Database className="w-4 h-4" />}
        {testing ? '확인 중…' : testResult === 'ok' ? '✅ 연결 성공!' : testResult === 'fail' ? '❌ 연결 실패 — URL/Key 재확인' : '연결 테스트'}
      </button>
      {testResult === 'fail' && (
        <button
          onClick={async () => {
            const debug = {
              timestamp: new Date().toISOString(),
              platform: navigator.platform,
              userAgent: navigator.userAgent,
              urlPrefix: supabaseUrl.slice(0, 40),
              keyPrefix: supabaseAnonKey.slice(0, 20) + '...',
              keyLength: supabaseAnonKey.length,
              wasPasted: pasteStatus === 'success',
            };
            try { await navigator.clipboard.writeText(JSON.stringify(debug, null, 2)); }
            catch {}
          }}
          className="w-full py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline"
        >
          🛠 디버그 정보 복사 (에러 공유용)
        </button>
      )}
    </div>,

    <div key={2} className="space-y-4">
      <p className="text-zinc-300">이 기기의 이름을 입력하세요. 기존 기기와 다른 이름을 사용하세요.</p>
      <OsToggle os={os} onChange={setOs} />
      <input type="text" value={deviceName} onChange={e => setDeviceName(e.target.value)}
        placeholder={os === 'mac' ? '예: 회사맥북, 집맥북' : '예: 회사PC, 집데스크탑'}
        className="w-full px-4 py-3 text-base bg-black/40 border border-zinc-600 text-white placeholder-zinc-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        autoFocus />
      <div className="grid grid-cols-3 gap-2">
        {(os === 'mac'
          ? ['회사맥북', '집맥북', '맥미니', '맥북에어', '맥스튜디오', '사이드맥']
          : ['회사PC', '집데스크탑', '노트북', '사무실PC', '게이밍PC', '미니PC']
        ).map(n => (
          <button key={n} onClick={() => setDeviceName(n)}
            className={`py-2 px-3 text-xs rounded-lg border transition-all ${deviceName === n ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}>
            {n}
          </button>
        ))}
      </div>
      {deviceName && testResult === 'ok' && (
        <InfoBox color="green">
          <p className="font-semibold mb-1">✅ 설정 완료!</p>
          <p className="text-xs text-zinc-300">기기: <span className="text-white">{deviceName}</span></p>
        </InfoBox>
      )}
    </div>,
  ];

  const canNext = [true, testResult === 'ok', !!deviceName];

  return (
    <WizardLayout
      title="추가 단말 세팅"
      progressColor="emerald"
      steps={steps}
      step={step}
      setStep={setStep}
      canNext={canNext}
      onBack={onBack}
      onComplete={() => onComplete({ supabaseUrl, supabaseAnonKey, deviceName })}
      canComplete={!!deviceName && testResult === 'ok'}
    >
      {stepContent[step]}
    </WizardLayout>
  );
}

// ─── Portal Vercel Wizard ─────────────────────────────────────────────────────

const PORTAL_SQL = `create table if not exists portal_items (
  id text primary key,
  device_id text,
  name text not null,
  type text not null,
  url text,
  path text,
  category text,
  description text,
  pinned boolean default false,
  visit_count integer default 0,
  last_visited text,
  created_at text
);

create table if not exists portal_categories (
  id text primary key,
  device_id text,
  name text not null,
  color text,
  "order" integer default 0
);

alter table portal_items disable row level security;
alter table portal_categories disable row level security;`;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function CmdBlock({ cmd, label }: { cmd: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative group">
      {label && <p className="text-[10px] text-zinc-500 mb-1">{label}</p>}
      <div className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-3 py-2">
        <code className="text-xs text-zinc-200 font-mono flex-1 select-all">{cmd}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-blue-400 w-3' : i < current ? 'bg-zinc-500' : 'bg-zinc-700'}`} />
      ))}
    </div>
  );
}

// ─── Windows 개발 환경 설정 마법사 ─────────────────────────────────────────────

function WindowsEnvWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [wslStatus, setWslStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState('');
  const [claudeStatus, setClaudeStatus] = useState<'checking' | 'installed' | 'missing' | 'unknown'>('checking');
  const [tmuxStatus, setTmuxStatus] = useState<'checking' | 'installed' | 'missing' | 'unknown'>('checking');
  const totalSteps = 4;

  useEffect(() => {
    fetch('/api/check-claude').then(r => r.json()).then(d => setClaudeStatus(d.installed ? 'installed' : 'missing')).catch(() => setClaudeStatus('unknown'));
    fetch('/api/check-tmux').then(r => r.json()).then(d => setTmuxStatus(d.installed ? 'installed' : 'missing')).catch(() => setTmuxStatus('unknown'));
  }, []);

  async function checkWsl() {
    setChecking(true);
    try {
      const res = await fetch('/api/check-wsl');
      if (res.ok) { const d = await res.json(); setWslStatus(d.status); }
      else setWslStatus('unknown');
    } catch { setWslStatus('offline'); }
    finally { setChecking(false); }
  }

  async function installTmux() {
    setInstalling(true); setInstallMsg('tmux 설치 중...');
    try {
      const res = await fetch('/api/install-wsl-tmux', { method: 'POST' });
      const d = await res.json();
      setInstallMsg(d.success ? '✅ tmux 설치 완료' : `❌ ${d.error}`);
      if (d.success) setWslStatus('ready');
    } catch { setInstallMsg('❌ api-server에 연결할 수 없습니다'); }
    finally { setInstalling(false); }
  }

  const statusLabel: Record<string, { color: string; text: string }> = {
    ready:          { color: 'text-green-400',  text: '✅ 준비 완료' },
    no_tmux:        { color: 'text-yellow-400', text: '⚠️ tmux 미설치' },
    no_distro:      { color: 'text-orange-400', text: '⚠️ Ubuntu 없음' },
    not_installed:  { color: 'text-red-400',    text: '❌ WSL2 미설치' },
    offline:        { color: 'text-zinc-500',   text: '— 앱에서 확인 가능' },
    unknown:        { color: 'text-zinc-500',   text: '— 확인 불가' },
  };

  const steps = [
    {
      title: 'WSL2 + Ubuntu 설치',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Windows에서 tmux·Claude Code를 쓰려면 <strong className="text-zinc-200">WSL2 + Ubuntu</strong>가 필요합니다.</p>
          <div className="space-y-2">
            <CmdBlock cmd="wsl --install" label="① PowerShell (관리자)에서 실행" />
            <p className="text-xs text-zinc-500">→ 설치 후 <strong className="text-zinc-300">PC 재시작</strong>, Ubuntu 첫 실행 시 사용자명·비밀번호 설정</p>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
            <p className="font-medium text-zinc-300">이미 설치되어 있다면?</p>
            <p>아래 버튼으로 상태 확인 후 다음 단계로 넘어가세요.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={checkWsl} disabled={checking}
              className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
              {checking ? '확인 중...' : '🔍 WSL 상태 확인'}
            </button>
            {wslStatus && (
              <span className={`flex items-center text-xs font-mono ${statusLabel[wslStatus]?.color ?? 'text-zinc-500'}`}>
                {statusLabel[wslStatus]?.text ?? wslStatus}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Claude Code 설치 (WSL)',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Ubuntu 터미널 또는 Windows Terminal에서 WSL을 열고 아래 명령을 실행하세요.</p>
            <StatusBadge status={claudeStatus} />
          </div>
          {claudeStatus === 'installed' ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-400">
              ✅ Claude Code가 이미 설치되어 있습니다. 다음 단계로 넘어가세요.
            </div>
          ) : (
            <>
              <CmdBlock cmd="curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs" label="① Node.js 설치 (없는 경우)" />
              <CmdBlock cmd="npm install -g @anthropic-ai/claude-code" label="② Claude Code 설치" />
              <CmdBlock cmd="claude --version" label="③ 설치 확인" />
            </>
          )}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
            💡 Claude Code는 WSL Ubuntu 안에 설치합니다. Windows 네이티브 설치는 지원하지 않습니다.
          </div>
        </div>
      ),
    },
    {
      title: 'tmux 설치',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">멀티 에이전트 기능(tmux 버튼)을 쓰려면 WSL 안에 tmux가 필요합니다.</p>
            <StatusBadge status={tmuxStatus} />
          </div>
          {tmuxStatus === 'installed' ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-400">
              ✅ tmux가 이미 설치되어 있습니다. 다음 단계로 넘어가세요.
            </div>
          ) : (
            <>
              <CmdBlock cmd="sudo apt-get install -y tmux" label="Ubuntu 터미널에서 실행" />
              <CmdBlock cmd="tmux -V" label="설치 확인" />
              {installMsg && <p className={`text-xs font-mono ${installMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{installMsg}</p>}
              <button onClick={installTmux} disabled={installing}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50">
                {installing ? '설치 중...' : '📦 앱에서 자동 설치 (api-server 실행 중인 경우)'}
              </button>
            </>
          )}
        </div>
      ),
    },
    {
      title: '완료',
      content: (
        <div className="space-y-4 text-center">
          <div className="text-5xl">🎉</div>
          <p className="text-base font-semibold text-white">설정 완료!</p>
          <p className="text-sm text-zinc-400">이제 앱의 tmux 버튼으로 WSL 안에서 Claude Code 세션을 바로 열 수 있습니다.</p>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-xs text-zinc-400 text-left space-y-1.5">
            <p className="font-medium text-zinc-300 mb-1">다음 단계</p>
            <p>• <strong className="text-zinc-300">Supabase 연동</strong>: 여러 기기 간 포트/포털 동기화</p>
            <p>• <strong className="text-zinc-300">포털 Vercel 배포</strong>: 북마크를 스마트폰에서도 접근</p>
            <p>• 상단 메뉴 → <strong className="text-zinc-300">⚙️ 설정</strong>에서 언제든 다시 열 수 있습니다</p>
          </div>
          <button onClick={onBack}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors">
            설정 마법사 홈으로
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col px-4 py-4 md:p-8">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-4 md:mb-6 transition-colors w-fit">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> 뒤로
      </button>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <Monitor className="w-5 h-5 text-blue-400" /> Windows 개발 환경 설정
        </h2>
        <StepDots total={totalSteps} current={step} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">{step + 1}. {steps[step].title}</h3>
        {steps[step].content}
      </div>
      <div className="flex gap-3 mt-4 md:mt-6 pt-4 border-t border-zinc-800">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-lg transition-colors">
            이전
          </button>
        )}
        {step < totalSteps - 1 && (
          <button onClick={() => setStep(s => s + 1)}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors">
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── macOS 개발 환경 설정 마법사 ──────────────────────────────────────────────

function StatusBadge({ status }: { status: 'checking' | 'installed' | 'missing' | 'unknown' }) {
  const map = {
    checking: { cls: 'text-zinc-400 bg-zinc-800 border-zinc-700', label: '확인 중…' },
    installed: { cls: 'text-green-400 bg-green-500/10 border-green-500/20', label: '✅ 이미 설치됨' },
    missing:   { cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', label: '설치 필요' },
    unknown:   { cls: 'text-zinc-500 bg-zinc-800 border-zinc-700', label: '확인 불가 (앱 전용)' },
  };
  const { cls, label } = map[status];
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function MacEnvWizard({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const [claudeStatus, setClaudeStatus] = useState<'checking' | 'installed' | 'missing' | 'unknown'>('checking');
  const [tmuxStatus, setTmuxStatus] = useState<'checking' | 'installed' | 'missing' | 'unknown'>('checking');
  const totalSteps = 4;

  useEffect(() => {
    fetch('/api/check-claude').then(r => r.json()).then(d => setClaudeStatus(d.installed ? 'installed' : 'missing')).catch(() => setClaudeStatus('unknown'));
    fetch('/api/check-tmux').then(r => r.json()).then(d => setTmuxStatus(d.installed ? 'installed' : 'missing')).catch(() => setTmuxStatus('unknown'));
  }, []);

  const steps = [
    {
      title: 'Homebrew 설치',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">macOS 패키지 매니저 Homebrew가 없으면 먼저 설치합니다.</p>
          <CmdBlock cmd='/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' label="Terminal에서 실행" />
          <CmdBlock cmd="brew --version" label="설치 확인" />
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-xs text-zinc-400">
            이미 설치되어 있다면 그냥 다음으로 넘어가세요.
          </div>
        </div>
      ),
    },
    {
      title: 'Claude Code 설치',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Node.js가 필요합니다. Homebrew로 설치하는 방법이 가장 편합니다.</p>
            <StatusBadge status={claudeStatus} />
          </div>
          {claudeStatus === 'installed' ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-400">
              ✅ Claude Code가 이미 설치되어 있습니다. 다음 단계로 넘어가세요.
            </div>
          ) : (
            <>
              <CmdBlock cmd="brew install node" label="① Node.js 설치 (없는 경우)" />
              <CmdBlock cmd="npm install -g @anthropic-ai/claude-code" label="② Claude Code 설치" />
              <CmdBlock cmd="claude --version" label="③ 설치 확인" />
              <CmdBlock cmd="claude" label="④ 첫 실행 → Anthropic 계정 인증" />
            </>
          )}
        </div>
      ),
    },
    {
      title: 'tmux + iTerm2 설치',
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">tmux 버튼은 iTerm2 터미널에서 tmux 세션을 엽니다.</p>
            <StatusBadge status={tmuxStatus} />
          </div>
          {tmuxStatus === 'installed' ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-sm text-green-400">
              ✅ tmux가 이미 설치되어 있습니다. iTerm2만 확인하세요.
            </div>
          ) : (
            <CmdBlock cmd="brew install tmux" label="tmux 설치" />
          )}
          <CmdBlock cmd="brew install --cask iterm2" label="iTerm2 설치 (없는 경우)" />
          <CmdBlock cmd="tmux -V" label="tmux 설치 확인" />
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
            💡 iTerm2가 없으면 tmux 버튼이 동작하지 않습니다. Terminal.app은 지원하지 않습니다.
          </div>
        </div>
      ),
    },
    {
      title: '완료',
      content: (
        <div className="space-y-4 text-center">
          <div className="text-5xl">🎉</div>
          <p className="text-base font-semibold text-white">설정 완료!</p>
          <p className="text-sm text-zinc-400">이제 앱의 tmux 버튼으로 iTerm2에서 Claude Code 세션을 바로 열 수 있습니다.</p>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 text-xs text-zinc-400 text-left space-y-1.5">
            <p className="font-medium text-zinc-300 mb-1">다음 단계</p>
            <p>• <strong className="text-zinc-300">Supabase 연동</strong>: 여러 기기 간 포트/포털 동기화 → "처음 사용"</p>
            <p>• <strong className="text-zinc-300">포털 Vercel 배포</strong>: 북마크를 스마트폰에서도 접근</p>
          </div>
          <button onClick={onBack}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors">
            설정 마법사 홈으로
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col px-4 py-4 md:p-8">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-4 md:mb-6 transition-colors w-fit">
        <ChevronRight className="w-3.5 h-3.5 rotate-180" /> 뒤로
      </button>
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" /> macOS 개발 환경 설정
        </h2>
        <StepDots total={totalSteps} current={step} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-semibold text-zinc-300 mb-4">{step + 1}. {steps[step].title}</h3>
        {steps[step].content}
      </div>
      <div className="flex gap-3 mt-4 md:mt-6 pt-4 border-t border-zinc-800">
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-lg transition-colors">
            이전
          </button>
        )}
        {step < totalSteps - 1 && (
          <button onClick={() => setStep(s => s + 1)}
            className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors">
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 통합 개발 환경 마법사 (Windows + macOS 토글) ─────────────────────────────
function DevEnvWizard({ defaultOs, onBack }: { defaultOs: OS; onBack: () => void }) {
  const [os, setOs] = useState<OS>(defaultOs);
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4 md:px-8 md:pt-6 shrink-0">
        <div className="mb-3">
          <p className="text-[11px] text-zinc-500 mb-2">먼저 운영체제를 선택하세요</p>
          <OsToggle os={os} onChange={setOs} />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {os === 'windows' ? <WindowsEnvWizard onBack={onBack} /> : <MacEnvWizard onBack={onBack} />}
      </div>
    </div>
  );
}

function PortalVercelWizard({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [os, setOs] = useState<OS>('mac');
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500);
  }

  const [sqlMode, setSqlMode] = useState<'cli' | 'web'>('cli');
  const [password, setPassword] = useState('');
  const [passwordHash, setPasswordHash] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── 자동 배포 상태 ────────────────────────────────────────────────
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployExitCode, setDeployExitCode] = useState<number | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [vercelUser, setVercelUser] = useState<string | null>(null);
  const [vercelCheckingAuth, setVercelCheckingAuth] = useState(false);

  async function checkVercelAuth() {
    setVercelCheckingAuth(true);
    try {
      const r = await fetch('/api/vercel-whoami');
      const j = await r.json();
      setVercelUser(j.loggedIn ? (j.user || 'logged in') : null);
    } catch { setVercelUser(null); }
    finally { setVercelCheckingAuth(false); }
  }

  async function startAutoDeploy() {
    setDeployLog([]); setDeployUrl(null); setDeployExitCode(null); setIsDeploying(true);
    try {
      const r = await fetch('/api/deploy-portal', { method: 'POST' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setDeployLog(l => [...l, `❌ 배포 시작 실패: ${j.error ?? r.statusText}`]);
        setIsDeploying(false);
        return;
      }
    } catch (e: any) {
      setDeployLog(l => [...l, `❌ 네트워크 오류: ${e.message}`]);
      setIsDeploying(false);
    }
  }

  // 배포 상태 폴링 (1초마다)
  useEffect(() => {
    if (!isDeploying) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/deploy-portal-status');
        const j = await r.json();
        if (cancelled) return;
        setDeployLog(j.output ?? []);
        if (j.url) setDeployUrl(j.url);
        if (!j.isDeploying) {
          setDeployExitCode(j.exitCode);
          setIsDeploying(false);
          if (j.exitCode === 0 && j.url) {
            try { await navigator.clipboard.writeText(j.url); } catch {}
          }
        }
      } catch {}
    };
    const id = setInterval(poll, 1000);
    void poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [isDeploying]);

  useEffect(() => {
    if (!password) { setPasswordHash(''); return; }
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
      .then(buf => setPasswordHash(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')));
  }, [password]);

  const vercelCmds = `npm install -g vercel
vercel login
vercel
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_PORTAL_PASSWORD_HASH
vercel --prod`;

  const steps = [
    { title: 'Fork & Vercel CLI 설치' },
    { title: 'Supabase 테이블 생성' },
    { title: '비밀번호 해시 생성' },
    { title: 'Vercel 환경 변수 & 배포' },
    { title: '기기 연결' },
  ];

  const stepContent = [
    /* 0: Fork & CLI */
    <div key={0} className="space-y-5">
      <InfoBox color="blue">
        GitHub에서 이 저장소를 Fork하고, Vercel CLI를 설치합니다.
      </InfoBox>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-zinc-400 mb-2">① 저장소 Fork</p>
          <a href="https://github.com/intenet1001-commits/portmanagement/fork"
            target="_blank" rel="noopener"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg text-sm text-white transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> GitHub에서 Fork 열기
          </a>
        </div>
        <div>
          <p className="text-xs text-zinc-400 mb-2">② Vercel CLI 설치</p>
          <CodeBlock label="터미널에서 실행" code="npm install -g vercel" />
        </div>
        <div>
          <p className="text-xs text-zinc-400 mb-2">③ Vercel 로그인 (브라우저 인증)</p>
          <CodeBlock label="" code="vercel login" />
        </div>
      </div>
    </div>,

    /* 1: Supabase SQL */
    <div key={1} className="space-y-4">
      {/* CLI / Web toggle */}
      <div className="flex gap-1 p-1 bg-zinc-800/60 rounded-lg w-fit">
        <button onClick={() => setSqlMode('cli')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sqlMode === 'cli' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
          <Terminal className="w-3 h-3 inline mr-1" />CLI 방식
        </button>
        <button onClick={() => setSqlMode('web')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sqlMode === 'web' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
          <Globe className="w-3 h-3 inline mr-1" />웹 대시보드
        </button>
      </div>

      {sqlMode === 'cli' ? (
        <div className="space-y-3">
          <InfoBox color="blue">
            Supabase CLI가 설치·로그인된 경우 터미널에서 바로 테이블을 생성할 수 있습니다.<br />
            <span className="text-zinc-400">Step 1에서 이미 프로젝트를 link했다면 그대로 진행하세요.</span>
          </InfoBox>
          <CodeBlock label="① 마이그레이션 파일 생성" code="supabase migration new portal_tables" comment="supabase/migrations/ 폴더에 SQL 파일이 생성됩니다" />
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-zinc-400">② 생성된 파일에 아래 SQL 붙여넣기</p>
              <button onClick={() => copy('sql', PORTAL_SQL)}
                className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                <Copy className="w-3 h-3" />{copied['sql'] ? '복사됨!' : 'SQL 복사'}
              </button>
            </div>
            <pre className="bg-black/50 border border-zinc-700 rounded-xl p-4 text-xs text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre-wrap max-h-40">{PORTAL_SQL}</pre>
          </div>
          <CodeBlock label="③ 원격 DB에 적용" code="supabase db push" comment="linked된 Supabase 프로젝트에 테이블이 생성됩니다" />
        </div>
      ) : (
        <div className="space-y-3">
          <InfoBox color="blue">
            Supabase 대시보드 → <strong>SQL Editor</strong> 에서 아래 SQL을 실행합니다.<br />
            이미 로컬 앱 마법사로 Supabase를 설정했다면, portal_items · portal_categories 두 테이블만 추가하면 됩니다.
          </InfoBox>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-zinc-400">Supabase SQL Editor에 붙여넣기</p>
              <button onClick={() => copy('sql', PORTAL_SQL)}
                className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                <Copy className="w-3 h-3" />{copied['sql'] ? '복사됨!' : 'SQL 복사'}
              </button>
            </div>
            <pre className="bg-black/50 border border-zinc-700 rounded-xl p-4 text-xs text-emerald-300 overflow-x-auto leading-relaxed whitespace-pre-wrap max-h-48">{PORTAL_SQL}</pre>
          </div>
        </div>
      )}
    </div>,

    /* 2: Password hash */
    <div key={2} className="space-y-5">
      <InfoBox color="blue">
        포털 접근 비밀번호를 설정합니다. 입력하면 해시가 자동으로 생성됩니다.<br />
        <span className="text-zinc-400">비밀번호 없이 공개 운영하려면 비워두고 다음으로 넘어가세요.</span>
      </InfoBox>
      <div>
        <label className="block text-xs text-zinc-400 mb-2">비밀번호 입력</label>
        <div className="flex gap-2">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="포털 접근 비밀번호"
            className="flex-1 px-3 py-2 text-sm bg-black/40 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all"
          />
          <button onClick={() => setShowPassword(p => !p)}
            className="px-3 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 rounded-lg transition-colors">
            {showPassword ? '숨기기' : '표시'}
          </button>
        </div>
      </div>
      {passwordHash ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-zinc-400">SHA-256 해시 (다음 단계에서 사용)</p>
            <button onClick={() => copy('hash', passwordHash)}
              className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
              <Copy className="w-3 h-3" />{copied['hash'] ? '복사됨!' : '복사'}
            </button>
          </div>
          <div className="bg-black/50 border border-zinc-700 rounded-xl px-4 py-3 font-mono text-xs text-emerald-300 break-all">{passwordHash}</div>
          <p className="text-[10px] text-zinc-600 mt-1">비밀번호 원문은 저장되지 않습니다. 해시값만 Vercel 환경 변수에 저장됩니다.</p>
        </div>
      ) : (
        <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl px-4 py-3 text-xs text-zinc-500">
          비밀번호를 입력하면 해시가 여기에 표시됩니다.
        </div>
      )}
    </div>,

    /* 3: Vercel deploy */
    <div key={3} className="space-y-4">
      <InfoBox color="blue">
        🚀 <strong>자동 배포</strong>: 로컬 앱이 <code className="text-violet-400">bun run build:portal</code> + <code className="text-violet-400">vercel --prod</code>를 자동 실행합니다.<br />
        <span className="text-zinc-400 text-[11px]">사전 조건: Vercel CLI 설치 + 로그인 완료 (Step 0 참고)</span>
      </InfoBox>

      {/* Vercel 로그인 상태 확인 */}
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={checkVercelAuth}
          disabled={vercelCheckingAuth}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 disabled:opacity-50"
        >
          {vercelCheckingAuth ? '확인 중…' : 'Vercel 로그인 확인'}
        </button>
        {vercelUser === null && !vercelCheckingAuth && <span className="text-zinc-500">아직 확인 안 됨</span>}
        {vercelUser && <span className="text-emerald-400">✓ 로그인됨: {vercelUser}</span>}
      </div>

      {/* 자동 배포 버튼 */}
      {!isDeploying && deployExitCode === null && (
        <button
          onClick={startAutoDeploy}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />🚀 자동 배포 시작
        </button>
      )}

      {/* 배포 진행 중 */}
      {isDeploying && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <RefreshCw className="w-4 h-4 animate-spin" />배포 중…
          </div>
          <pre className="bg-black/70 border border-zinc-700 rounded-xl p-3 text-[11px] text-zinc-300 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">{deployLog.join('') || '(대기)'}</pre>
        </div>
      )}

      {/* 배포 완료 */}
      {deployExitCode === 0 && deployUrl && (
        <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-300">✓ 배포 완료</p>
          <p className="text-xs text-zinc-400">이 URL을 2번째 기기 브라우저에서 열면 "새 기기" 버튼으로 설정 복사 가능 (URL은 클립보드에도 자동 복사됨)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-xs bg-black/40 rounded-lg text-emerald-300 font-mono break-all">{deployUrl}</code>
            <button onClick={() => copy('deployUrl', deployUrl)} className="px-3 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700">
              {copied['deployUrl'] ? '복사됨!' : '복사'}
            </button>
          </div>
        </div>
      )}

      {/* 배포 실패 */}
      {deployExitCode !== null && deployExitCode !== 0 && (
        <div className="border border-red-500/40 bg-red-500/10 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-red-300">❌ 배포 실패 (exit {deployExitCode})</p>
          <p className="text-xs text-zinc-400">로그를 확인하고, 아래 수동 가이드로 다시 시도하거나 Vercel 로그인 상태를 확인하세요.</p>
          <pre className="bg-black/70 border border-zinc-700 rounded-xl p-3 text-[10px] text-zinc-400 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">{deployLog.join('')}</pre>
          <button onClick={() => { setDeployExitCode(null); setDeployLog([]); setDeployUrl(null); }} className="text-xs text-violet-400 hover:text-violet-300 underline">
            다시 시도
          </button>
        </div>
      )}

      {/* 수동 배포 fallback (접힘) */}
      <button
        onClick={() => setShowManualFallback(s => !s)}
        className="w-full text-[11px] text-zinc-500 hover:text-zinc-300 underline transition-colors"
      >
        {showManualFallback ? '▲ 수동 배포 가이드 닫기' : '▼ 수동 배포 가이드 (CLI가 없거나 실패 시)'}
      </button>
      {showManualFallback && (
        <div className="space-y-3 pt-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-zinc-400">터미널 — 저장소 루트에서 실행</p>
              <button onClick={() => copy('vercel', vercelCmds)} className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"><Copy className="w-3 h-3" />{copied['vercel'] ? '복사됨!' : '전체 복사'}</button>
            </div>
            <pre className="bg-black/50 border border-zinc-700 rounded-xl p-4 text-xs text-emerald-300 font-mono leading-loose">{vercelCmds}</pre>
          </div>
          <div className="rounded-xl border border-zinc-700 p-4 space-y-2 text-xs text-zinc-400">
            <p className="font-medium text-zinc-300">입력 값 안내</p>
            <div className="space-y-1">
              <p><code className="text-violet-400">VITE_SUPABASE_URL</code> — Supabase → Project Settings → API → Project URL</p>
              <p><code className="text-violet-400">VITE_SUPABASE_ANON_KEY</code> — 같은 페이지 anon/public key</p>
              <p><code className="text-violet-400">VITE_PORTAL_PASSWORD_HASH</code> —{' '}
                {passwordHash
                  ? <span className="text-emerald-400 font-mono break-all">{passwordHash.slice(0, 20)}…  (Step 2 생성값 ✓)</span>
                  : <span>Step 2 해시</span>
                }
              </p>
            </div>
          </div>
        </div>
      )}
    </div>,

    /* 4: Connect device */
    <div key={4} className="space-y-4">
      <InfoBox color="green">
        배포가 완료됐습니다! 이제 로컬 앱과 연결합니다.
      </InfoBox>
      <ol className="space-y-4 text-sm text-zinc-300">
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs text-blue-400 shrink-0 mt-0.5">1</span>
          <div>
            <p className="font-medium">로컬 앱에서 Push 실행</p>
            <p className="text-xs text-zinc-500 mt-1">북마크 탭 → <strong>Push</strong> 버튼 클릭 → Supabase에 이 기기 데이터 등록</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs text-blue-400 shrink-0 mt-0.5">2</span>
          <div>
            <p className="font-medium">배포된 URL 접속</p>
            <p className="text-xs text-zinc-500 mt-1">비밀번호 입력 → 기기 목록에서 이 기기 선택 → 데이터 자동 Pull</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs text-blue-400 shrink-0 mt-0.5">3</span>
          <div>
            <p className="font-medium">이후 동기화</p>
            <p className="text-xs text-zinc-500 mt-1">로컬 앱 북마크 탭 → Push / 웹 포털 헤더 → Pull</p>
          </div>
        </li>
      </ol>
      <div className="pt-2">
        <button onClick={onClose}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
          완료 <Check className="w-4 h-4" />
        </button>
      </div>
    </div>,
  ];

  const canNext = [true, true, true, true, true];

  return (
    <WizardLayout
      title="북마크 포털 배포"
      progressColor="blue"
      steps={steps}
      step={step}
      setStep={setStep}
      canNext={canNext}
      onBack={onBack}
      onComplete={onClose}
      canComplete={true}
    >
      {stepContent[step]}
    </WizardLayout>
  );
}

// ─── Shared Wizard Layout ──────────────────────────────────────────────────────

function WizardLayout({
  title, progressColor, steps, step, setStep, canNext, onBack, onComplete, canComplete, children,
}: {
  title: string; progressColor: 'blue' | 'emerald'; steps: { title: string }[];
  step: number; setStep: (n: number) => void; canNext: boolean[];
  onBack: () => void; onComplete: () => void; canComplete: boolean; children: React.ReactNode;
}) {
  const isLast = step === steps.length - 1;
  const colors = progressColor === 'blue' ? { bar: 'bg-blue-500', btn: 'bg-blue-500 hover:bg-blue-600' } : { bar: 'bg-emerald-500', btn: 'bg-emerald-500 hover:bg-emerald-600' };

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar — hidden on mobile, visible md+ */}
      <div className="hidden md:flex w-52 shrink-0 border-r border-zinc-800 p-5 flex-col gap-0.5 overflow-y-auto">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mb-3">{title}</p>
        {steps.map((s, i) => (
          <button key={i} onClick={() => (i < step) ? setStep(i) : undefined}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
              i === step ? 'bg-zinc-800 text-white' : i < step ? 'text-zinc-400 hover:bg-zinc-800/50 cursor-pointer' : 'text-zinc-600 cursor-default'
            }`}>
            <StepDot num={i + 1} active={i === step} done={i < step} />
            <span className="text-xs font-medium leading-tight">{s.title}</span>
          </button>
        ))}
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <button onClick={onBack} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← 뒤로</button>
        </div>
      </div>

      {/* Mobile step indicator */}
      <div className="flex md:hidden items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
        <button onClick={onBack} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← 뒤로</button>
        <span className="text-xs text-zinc-500">{steps[step].title}</span>
        <span className="text-xs text-zinc-600">{step + 1}/{steps.length}</span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4 md:p-8">
          <div className="max-w-lg">
            <div className="hidden md:flex items-center justify-between mb-1">
              <h2 className="text-xl font-semibold text-white">{steps[step].title}</h2>
              <span className="text-xs text-zinc-600">{step + 1} / {steps.length}</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1 mb-4 md:mb-6">
              <div className={`${colors.bar} h-1 rounded-full transition-all duration-300`} style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>
            {children}
          </div>
        </div>
        <div className="border-t border-zinc-800 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between shrink-0">
          <button onClick={() => step > 0 ? setStep(step - 1) : undefined} disabled={step === 0}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors">
            ← 이전
          </button>
          {isLast ? (
            <button onClick={onComplete} disabled={!canComplete}
              className={`px-4 py-2 md:px-6 ${colors.btn} disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2`}>
              완료 및 동기화 <Check className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} disabled={!canNext[step]}
              className="px-4 py-2 md:px-6 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2">
              다음 <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main SetupWizard ──────────────────────────────────────────────────────────

export default function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [detectedOs, setDetectedOs] = useState<'mac' | 'windows' | null>(null);

  useEffect(() => {
    const p = navigator.platform.toLowerCase();
    const ua = navigator.userAgent.toLowerCase();
    if (p.includes('win') || ua.includes('windows')) setDetectedOs('windows');
    else if (p.includes('mac') || ua.includes('mac')) setDetectedOs('mac');
  }, []);

  return (
    /* Backdrop */
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-6">
      {/* Window chrome */}
      <div className="bg-[#0a0a0b] border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-4xl h-[95vh] sm:h-[680px] flex flex-col overflow-hidden">

        {/* Title bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#111113] border-b border-zinc-800 shrink-0 select-none">
          {/* macOS-style traffic lights */}
          <div className="flex items-center gap-2">
            <button onClick={onSkip}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              title="닫기 (건너뛰기)" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60 cursor-default" />
            <div className="w-3 h-3 rounded-full bg-green-500/60 cursor-default" />
          </div>
          {/* Center title */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-400 font-medium">초기 설정 마법사</span>
          </div>
          <button onClick={onSkip}
            className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800">
            건너뛰기
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {mode === 'choose' && (
            <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8 gap-6 overflow-y-auto">
              <div className="text-center space-y-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white">어떤 상황인가요?</h2>
                <p className="text-zinc-400 text-sm">상황에 맞는 맞춤 가이드로 안내합니다.</p>
                {detectedOs && (
                  <p className="text-xs text-zinc-500">
                    감지된 OS: <span className="text-blue-400">{detectedOs === 'mac' ? '🍎 macOS' : '🪟 Windows'}</span>
                    {' '}— 아래에서 해당 가이드를 선택하세요
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
                <button onClick={() => setMode('first')}
                  className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/50 rounded-2xl p-5 sm:p-7 text-left transition-all duration-200">
                  <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-blue-500/20 transition-all">
                    <Plus className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">🆕 처음 사용</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">Supabase 가입부터<br />CLI로 모든 것을 설정</p>
                  <div className="flex items-center gap-1 text-blue-400 text-xs mt-3 sm:mt-4 group-hover:gap-2 transition-all">
                    시작하기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
                <button onClick={() => setMode('additional')}
                  className="group bg-zinc-900 hover:bg-zinc-800 border-2 border-emerald-500/40 hover:border-emerald-500/70 rounded-2xl p-5 sm:p-7 text-left transition-all duration-200 relative">
                  <span className="absolute top-2 right-2 text-[9px] text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">빠름</span>
                  <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-emerald-500/20 transition-all">
                    <Laptop className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">🔗 추가 기기 연결</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">이미 1st 기기 설정 완료<br />포털 웹 → "새 기기" 복사 → 붙여넣기</p>
                  <div className="flex items-center gap-1 text-emerald-400 text-xs mt-3 sm:mt-4 group-hover:gap-2 transition-all">
                    시작하기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
                <button onClick={() => setMode('dev_env')}
                  className={`group bg-zinc-900 hover:bg-zinc-800 border rounded-2xl p-5 sm:p-7 text-left transition-all duration-200 ${detectedOs ? 'border-zinc-700 hover:border-sky-500/50' : 'border-zinc-700 hover:border-sky-500/50'}`}>
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center group-hover:bg-sky-500/20 transition-all">
                      <Monitor className="w-5 h-5 text-sky-400" />
                    </div>
                    {detectedOs && <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">{detectedOs === 'mac' ? '🍎 Mac' : '🪟 Win'}</span>}
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">⚙️ 개발 환경 설정</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">WSL2/Homebrew · Claude Code<br />tmux · 필수 도구 설치</p>
                  <div className="flex items-center gap-1 text-sky-400 text-xs mt-3 sm:mt-4 group-hover:gap-2 transition-all">
                    시작하기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
              {/* Portal 배포는 1st 완료 후 "다음 액션"으로 안내 → choose에서는 제외 */}
              <p className="text-[11px] text-zinc-600 mt-2">
                💡 다른 기기 연결을 위한 <span className="text-violet-400">북마크 포털 배포</span>는 1st 기기 완료 후 안내됩니다
              </p>
            </div>
          )}
          {mode === 'first' && <FirstSetupWizard onComplete={onComplete} onBack={() => setMode('choose')} />}
          {mode === 'additional' && <AdditionalDeviceWizard onComplete={onComplete} onBack={() => setMode('choose')} />}
          {mode === 'portal' && <PortalVercelWizard onBack={() => setMode('choose')} onClose={onSkip} />}
          {mode === 'dev_env' && (
            <DevEnvWizard defaultOs={detectedOs ?? 'mac'} onBack={() => setMode('choose')} />
          )}
          {/* Legacy direct entry (kept for backward compat) */}
          {mode === 'windows_env' && <WindowsEnvWizard onBack={() => setMode('choose')} />}
          {mode === 'mac_env' && <MacEnvWizard onBack={() => setMode('choose')} />}
        </div>
      </div>
    </div>
  );
}
