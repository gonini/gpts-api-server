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

export default function Home() {
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
          주요 필드는 다음과 같습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">필드</th>
                <th className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">ticker</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">요청한 티커를 그대로 반환합니다.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">as_of</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">분석에 사용한 가격 데이터의 최신 거래일.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">segments</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  실적 변곡점별 데이터 배열. 각 항목에는 실적 레이블, EPS/매출 전년 대비 증감률,
                  분석 구간(period), 가격 반응(price_reaction), 출처 URL이 포함됩니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">earnings.eps</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  발표 분기의 주당순이익(EPS). 음수면 순손실을 의미합니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">earnings.eps_yoy</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  전년 동기 대비 EPS 변화율. (현재 EPS ÷ 전년 EPS) - 1 로 계산합니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">earnings.rev_yoy</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  전년 동기 대비 매출 변화율. 기초 데이터가 없으면 <code className="font-mono">null</code> 로 남습니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">price_reaction.window</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  Day0(발표 직후 첫 거래일)을 기준으로 누적 초과 수익률을 집계한 거래일 범위.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">price_reaction.ret_sum</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  윈도우 동안 종목 일별 수익률을 누적한 값. 0.05는 약 5% 포인트 상승을 의미합니다.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">price_reaction.bench_sum</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  동일 기간 S&P 500 ETF(SPY)의 누적 수익률.
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">price_reaction.car</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  <code className="font-mono">ret_sum - bench_sum</code>. 시장 대비 초과 수익률 누적치이며 0.07은 시장 대비 +7%p를 의미합니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="오류 응답">
        <p>
          아래 오류 코드는 공통으로 <code className="font-mono">success: false</code> 와 오류 메시지를 포함합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">HTTP 상태</th>
                <th className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-100">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">400 Bad Request</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">필수 파라미터 누락 또는 Zod 스키마 검증 실패.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">404 Not Found</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">지정 기간에 가격 또는 실적 데이터가 존재하지 않는 경우.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">422 Unprocessable Entity</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300"><code className="font-mono">ERR_</code> 접두의 비즈니스 로직 오류. (예: 가격 정렬 실패)</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">429 Too Many Requests</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">분당 60회 레이트 리미트 초과.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">500 Internal Server Error</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">예상치 못한 서버 오류.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="추가 참고">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            `source_urls`는 분석에 사용한 원천 데이터 위치를 나타내며, Yahoo Finance 및 Alpha Vantage 스킴을 사용합니다.
          </li>
          <li>
            데이터는 60분(가격)~72시간(실적) 동안 캐시되어 같은 요청에 대해 API 응답 속도가 빨라집니다.
          </li>
          <li>
            차후 Chat/Users 등 다른 엔드포인트 문서는 순차적으로 추가될 예정입니다.
          </li>
        </ul>
        <p>
          궁금한 점이 있다면 <Link href="mailto:support@example.com" className="text-sky-600 underline underline-offset-4">support@example.com</Link> 으로 문의 주세요.
        </p>
      </Section>
    </main>
  );
}
