import Link from "next/link";
import { ReactNode } from "react";

type SectionProps = {
  title: string;
  children: ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <div className="space-y-3 text-base leading-7 text-slate-700 dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100 shadow-inner">
      <code>{children}</code>
    </pre>
  );
}

const baseUrl = "https://gpts-api-server.vercel.app";

export default function AnalyzeDocsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-16 px-6 py-12">
      <header className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-500">
          GPTs API Server · Product Docs
        </p>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          Analyze API Reference
        </h1>
        <p className="text-lg text-slate-700 dark:text-slate-300">
          `/api/analyze` 엔드포인트는 미국 상장 기업의 실적 변곡점을 탐지하고, 해당 발표
          전후 주가가 시장 대비 얼마나 초과 수익(또는 저조)을 보였는지 알려줍니다.
        </p>
        <div className="rounded-md border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <strong className="font-semibold">Base URL</strong>
          <p className="mt-1 font-mono text-sm">{baseUrl}</p>
        </div>
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
          >
            ← 홈으로 돌아가기
          </Link>
        </div>
      </header>

      <Section title="요약">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            초당 요청 수는 제한되지 않지만, IP 당 분당 최대 <strong>60회</strong> 까지만 허용됩니다.
          </li>
          <li>
            GET 쿼리 스트링과 POST JSON 바디를 모두 지원하며, 두 방식 모두 동일한 스키마를 사용합니다.
          </li>
          <li>
            실적(EPS)·매출 데이터는 Alpha Vantage/SEC, 가격 데이터는 Yahoo Finance에서 수집합니다.
          </li>
          <li>
            실적 발표일을 기준으로 두 개의 기본 윈도우([-1,+5], [-5,+20])에 대한 누적 초과 수익률(CAR)을 제공합니다.
          </li>
        </ul>
      </Section>

      <Section title="요청 형식">
        <p>
          기본 URL에 다음 엔드포인트를 붙여 호출합니다. 레이트 리미터를 통과하지 못하면
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">429 Too Many Requests</code>
          와 함께 재시도 시간을 포함한 헤더를 돌려받습니다.
        </p>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
          <p className="font-semibold text-slate-900 dark:text-slate-100">HTTP</p>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">GET {baseUrl}/api/analyze</p>
          <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">또는</p>
          <p className="font-mono text-sm text-slate-600 dark:text-slate-300">POST {baseUrl}/api/analyze</p>
        </div>
        <p>
          요청 파라미터는 아래와 같습니다. POST 요청 시 JSON 바디에 동일한 필드를 포함하세요.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                  파라미터
                </th>
                <th scope="col" className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                  필수 여부
                </th>
                <th scope="col" className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                  설명
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">ticker</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">필수</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  분석할 미국 상장 종목의 티커. 대문자 영문과 점(.), 하이픈(-)만 허용됩니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">from</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">필수</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  분석 기간의 시작일 (YYYY-MM-DD). 요청일 기준 과거 날짜여야 하며 미래 날짜는 허용되지 않습니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">to</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">필수</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  분석 기간의 종료일 (YYYY-MM-DD). 시작일보다 같거나 이후여야 합니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock>{`curl "${baseUrl}/api/analyze?ticker=NBR&from=2023-01-01&to=2024-12-31"`}</CodeBlock>
        <CodeBlock>{`curl -X POST "${baseUrl}/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "NBR",
    "from": "2023-01-01",
    "to": "2024-12-31"
  }'`}</CodeBlock>
      </Section>

      <Section title="응답 형식">
        <p>
          성공 시 <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">200 OK</code> 와 함께 아래 구조의 JSON을 돌려줍니다.
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">success</code>
          가 <code className="font-mono">true</code>일 때 <code className="font-mono">data</code> 필드에 분석 결과가 채워집니다.
        </p>
        <CodeBlock>{`{
  "success": true,
  "data": {
    "ticker": "NBR",
    "as_of": "2025-09-28",
    "segments": [
      {
        "label": "2024-12-31 EPS YoY 281%",
        "earnings": {
          "date": "2024-12-31",
          "when": "unknown",
          "eps": -19.65,
          "eps_yoy": 2.8081,
          "rev_yoy": null
        },
        "period": {
          "start": "2024-12-27",
          "end": ""
        },
        "price_reaction": {
          "window": "[-1,+5]",
          "car": 0.0711,
          "ret_sum": 0.0598,
          "bench_sum": -0.0114
        },
        "source_urls": [
          "yahoo-finance://chart/NBR?period1=2014-01-01&period2=2024-12-31",
          "yahoo-finance://earnings/NBR?from=2014-01-01&to=2024-12-31"
        ]
      }
    ]
  }
}`}</CodeBlock>
        <p>
          <code className="font-mono">segments</code> 배열의 각 항목은 감지된 실적 변곡점을 나타내며, 아래 필드로 구성됩니다.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>label</strong>: 변곡점 요약(기준 분기, YoY 변화율 등)
          </li>
          <li>
            <strong>earnings</strong>: 실적 세부 수치 (EPS, EPS YoY, 매출 YoY 등)
          </li>
          <li>
            <strong>period</strong>: Day0 거래일을 기준으로 한 분석 윈도우의 실제 날짜 범위
          </li>
          <li>
            <strong>price_reaction</strong>: 시장 대비 초과 수익률(CAR) 및 구성 값
          </li>
          <li>
            <strong>source_urls</strong>: 데이터를 수집한 원천 링크 모음
          </li>
        </ul>
      </Section>

      <Section title="오류 코드">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                  상태 코드
                </th>
                <th scope="col" className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">
                  설명
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">400 Bad Request</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  요청 스키마 검증에 실패한 경우입니다. 필수 파라미터 누락, 날짜 형식 오류 등을 확인하세요.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">401 Unauthorized</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">프리뷰 키 또는 인증 토큰이 유효하지 않은 경우.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">404 Not Found</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  해당 티커의 가격 또는 실적 데이터가 존재하지 않을 때 반환됩니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">422 Unprocessable Entity</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  비즈니스 로직 오류 (`ERR_` 접두 코드) 가 발생한 경우. 응답 본문 메시지를 확인하세요.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">429 Too Many Requests</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  레이트 리미트(분당 60회)를 초과한 경우로, `Retry-After` 헤더에 다음 호출 가능 시점을 제공합니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">500 Internal Server Error</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  서버 내부 오류입니다. 지속적으로 발생한다면 지원팀에 문의하세요.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="추가 참고 사항">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            실적 발표가 개장 전(BMO)인지 여부에 따라 Day0을 조정해 CAR을 계산합니다.
          </li>
          <li>
            거래일 기준으로 가격 데이터를 정렬하며, 해당 구간 내 결측치는 직전 종가로 보간하지 않고 윈도우를 자동 축소합니다.
          </li>
          <li>
            Alpha Vantage 무료 티어 한도(분당 5회)를 고려해 내부적으로 캐시를 활용하므로, 동일한 요청은 TTL이 만료될 때까지 저장된 값을 재사용합니다.
          </li>
        </ul>
      </Section>
    </main>
  );
}
