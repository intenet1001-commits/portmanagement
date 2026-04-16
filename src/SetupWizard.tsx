import React, { useState } from 'react';
import {
  Check, Copy, ChevronRight, Terminal, Database, Server,
  Globe, ArrowRight, ExternalLink, Laptop, Plus, RefreshCw, Monitor,
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: (config: { supabaseUrl: string; supabaseAnonKey: string; deviceName: string }) => void;
  onSkip: () => void;
}

type Mode = 'choose' | 'first' | 'additional';
type OS = 'mac' | 'windows';

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

  const createProjectCmd = `# 1. Org ID 확인
supabase orgs list

# 2. 프로젝트 생성 (org-id는 위 결과에서 복사)
supabase projects create portmanagement \\
  --org-id <YOUR_ORG_ID> \\
  --db-password <원하는_비밀번호> \\
  --region ap-northeast-1`;

  const stepContent = [
    // 0: 가입
    <div key={0} className="space-y-4">
      <p className="text-zinc-400 text-sm">Supabase는 무료 PostgreSQL 호스팅으로, 여러 기기 간 데이터 동기화에 사용합니다.</p>
      <InfoBox color="blue">
        <p className="font-semibold mb-2">가입 방법</p>
        <ol className="list-decimal list-inside space-y-1.5 text-sm">
          <li><span className="text-blue-300 underline cursor-pointer">supabase.com</span> 접속</li>
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
      <p className="text-zinc-400 text-sm">Supabase CLI로 프로젝트 생성부터 테이블 생성까지 모두 터미널에서 처리합니다.</p>
      <OsToggle os={os} onChange={setOs} />
      <CodeBlock label="1. CLI 설치" code={cliInstall} />
      <CodeBlock label="2. 버전 확인" code="supabase --version" comment="1.x 이상이면 정상" />
      <CodeBlock label="3. 로그인 (브라우저 인증)" code="supabase login" comment="브라우저가 열리면 Supabase 계정으로 인증" />
      {os === 'windows' && (
        <InfoBox color="amber">
          <p className="text-xs">⚠️ Windows: PowerShell을 <strong>관리자 권한</strong>으로 실행하거나, Scoop 설치 후 새 터미널 창을 여세요.</p>
        </InfoBox>
      )}
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
      <CodeBlock label="1. 마이그레이션 파일 생성" code="supabase migration new init_portmanagement" comment="supabase/migrations/ 폴더에 파일 생성됨" />
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>생성된 파일을 열고 아래 SQL을 붙여넣기:</p>
        <p className="text-zinc-600">경로: <code className="text-zinc-400">supabase/migrations/[타임스탬프]_init_portmanagement.sql</code></p>
      </div>
      <CodeBlock label="2. SQL 내용 (파일에 붙여넣기)" code={MIGRATION_SQL} />
      <CodeBlock label="3. DB에 적용" code="supabase db push" comment="완료 시 'Finished supabase db push' 출력" />
    </div>,

    // 5: API Key
    <div key={5} className="space-y-4">
      <p className="text-zinc-400 text-sm">CLI로 API 키를 가져옵니다.</p>
      {refId
        ? <CodeBlock label="API Key 조회" code={`supabase projects api-keys --project-ref ${refId}`} />
        : <InfoBox color="amber"><p className="text-xs">이전 단계에서 Project Ref를 입력해야 합니다.</p></InfoBox>
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
        <InfoBox color="amber">
          <p className="text-xs space-y-1">
            <span className="block">• URL 형식: <code>https://[ref].supabase.co</code></span>
            <span className="block">• anon key 사용 여부 확인 (service_role 아님)</span>
            <span className="block">• <code>supabase db push</code>가 완료됐는지 확인</span>
          </p>
        </InfoBox>
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
      <CodeBlock label="저장소 클론 & 실행" code={cloneCmd} />
      {os === 'mac' && (
        <CodeBlock label="또는: 이미 폴더가 있는 경우" code={`cd portmanagement
git pull
bun run start`} />
      )}
      {os === 'windows' && (
        <InfoBox color="amber">
          <p className="text-xs space-y-1">
            <span className="block">• Bun for Windows: <code>powershell -c "irm bun.sh/install.ps1 | iex"</code></span>
            <span className="block">• 또는 npm 사용: <code>npm install && npm run start</code></span>
          </p>
        </InfoBox>
      )}
      <InfoBox>
        <p className="text-xs text-zinc-400">
          실행 후 브라우저에서 <code className="text-emerald-400">http://localhost:9000</code> 접속
          {os === 'windows' && ' (방화벽 허용 필요할 수 있음)'}
        </p>
      </InfoBox>
    </div>,

    <div key={1} className="space-y-4">
      <p className="text-zinc-400 text-sm">기존 기기와 동일한 Supabase URL + Anon Key를 입력하세요.</p>
      <InfoBox color="amber">
        <p className="text-xs">💡 기존 기기에서: 상단 ⚙ → Project URL + Anon Key 복사</p>
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
      <button onClick={testConnection} disabled={!supabaseUrl || !supabaseAnonKey || testing}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border ${
          testResult === 'ok' ? 'bg-green-500/10 text-green-400 border-green-500/30'
          : testResult === 'fail' ? 'bg-red-500/10 text-red-400 border-red-500/30'
          : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30 disabled:opacity-40'
        }`}>
        {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : testResult === 'ok' ? <Check className="w-4 h-4" /> : <Database className="w-4 h-4" />}
        {testing ? '확인 중…' : testResult === 'ok' ? '✅ 연결 성공!' : testResult === 'fail' ? '❌ 연결 실패 — URL/Key 재확인' : '연결 테스트'}
      </button>
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
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-zinc-800 p-5 flex flex-col gap-0.5 overflow-y-auto">
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

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-lg">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-semibold text-white">{steps[step].title}</h2>
              <span className="text-xs text-zinc-600">{step + 1} / {steps.length}</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1 mb-6">
              <div className={`${colors.bar} h-1 rounded-full transition-all duration-300`} style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>
            {children}
          </div>
        </div>
        <div className="border-t border-zinc-800 px-8 py-4 flex items-center justify-between shrink-0">
          <button onClick={() => step > 0 ? setStep(step - 1) : undefined} disabled={step === 0}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition-colors">
            ← 이전
          </button>
          {isLast ? (
            <button onClick={onComplete} disabled={!canComplete}
              className={`px-6 py-2 ${colors.btn} disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2`}>
              완료 및 동기화 <Check className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => setStep(step + 1)} disabled={!canNext[step]}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-all flex items-center gap-2">
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

  return (
    /* Backdrop */
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      {/* Window chrome */}
      <div className="bg-[#0a0a0b] border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/60 w-full max-w-4xl h-[680px] flex flex-col overflow-hidden">

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
            <div className="h-full flex flex-col items-center justify-center p-8 gap-8">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-white">어떤 상황인가요?</h2>
                <p className="text-zinc-400 text-sm">상황에 맞는 맞춤 가이드로 안내합니다.</p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
                <button onClick={() => setMode('first')}
                  className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/50 rounded-2xl p-7 text-left transition-all duration-200">
                  <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-all">
                    <Plus className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">처음 사용</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">Supabase 가입부터<br />CLI로 모든 것을 설정</p>
                  <div className="flex items-center gap-1 text-blue-400 text-xs mt-4 group-hover:gap-2 transition-all">
                    시작하기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
                <button onClick={() => setMode('additional')}
                  className="group bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500/50 rounded-2xl p-7 text-left transition-all duration-200">
                  <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-all">
                    <Laptop className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-1">추가 단말 등록</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">다른 기기에서 이미 설정 완료,<br />이 기기만 추가로 연결</p>
                  <div className="flex items-center gap-1 text-emerald-400 text-xs mt-4 group-hover:gap-2 transition-all">
                    시작하기 <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
            </div>
          )}
          {mode === 'first' && <FirstSetupWizard onComplete={onComplete} onBack={() => setMode('choose')} />}
          {mode === 'additional' && <AdditionalDeviceWizard onComplete={onComplete} onBack={() => setMode('choose')} />}
        </div>
      </div>
    </div>
  );
}
