# SEC EDGAR Historical Data Collection Tests

This test suite validates the core functionality for collecting historical SEC EDGAR data, including the expansion of `fetchRawSECReports` to include shards and full-index fallback.

## Test Scenarios

### 1. fetchRawSECReports - Shards 병합 + 날짜 필터링
- **Purpose**: Verify that recent filings are merged with shard data and date filtering is applied at the end
- **Test**: `should merge recent filings with shards and apply date filter at the end`
- **Validation**: 
  - All filings from recent + shards are included
  - Date filtering is applied after merging
  - Only allowed forms (10-K, 10-Q, 8-K) are included

### 2. fetchFromFullIndex - 2007년 master.idx 파싱
- **Purpose**: Test parsing of master.idx files to extract historical 8-K headers
- **Test**: `should parse master.idx and generate 8-K headers for 2007`
- **Validation**:
  - Master.idx format parsing (CIK|Company|Form|Date Filed|Filename)
  - 8-K entries are correctly extracted
  - Accession numbers are properly generated
  - Primary documents are correctly identified

### 3. determineEventDate - Press Release 날짜 추출 및 ±21일 범위 검증
- **Purpose**: Test event date determination from press releases with date range validation
- **Tests**:
  - `should extract multiple dates from press release and select closest to filing date within ±21 days`
  - `should select date within ±21 days when available`
- **Validation**:
  - Multiple dates are extracted from press release content
  - Dates are filtered to within ±21 days of filing date
  - Closest date to filing date is selected

### 4. parseExhibits - 노이즈 필터링 및 데이터 분류
- **Purpose**: Test exhibit parsing with noise filtering and data classification
- **Test**: `should filter out noise files and classify data files correctly`
- **Validation**:
  - Press releases are correctly identified
  - Regular exhibits are included
  - XML files are classified as data
  - Noise files (R*.htm, index-headers.html, css/js/img) are excluded

### 5. chooseBestFact - USD 유닛 선택 및 최근성/폼 가중치
- **Purpose**: Test fact selection logic with form matching, recency, and proximity scoring
- **Tests**:
  - `should select 2025Q1 over 2011Q2 based on form match, recency, and proximity`
  - `should prioritize form match over recency when forms differ`
- **Validation**:
  - Form matching is prioritized
  - Recency is considered (within 6 years)
  - Proximity to report date is factored in
  - Year matching is most important

### 6. collectUSDUnitFacts - USD 유닛 집계
- **Purpose**: Test USD unit aggregation and filtering
- **Tests**:
  - `should aggregate all USD units and filter by recency`
  - `should fallback to all units when no USD units found`
- **Validation**:
  - USD and USD/shares units are included
  - Non-USD units are excluded
  - Fallback to all units when no USD units found

## Test Configuration

- **Framework**: Jest with TypeScript support
- **Mocking**: nock for HTTP requests, jest.mock for modules
- **Coverage**: Core logic functions without external dependencies
- **Setup**: Mocked CacheService and secFetch functions

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Results

All 9 tests pass, validating:
- ✅ Shards merging and date filtering
- ✅ Master.idx parsing for historical data
- ✅ Event date determination with range validation
- ✅ Exhibit noise filtering and data classification
- ✅ Fact selection with form/recency/proximity scoring
- ✅ USD unit aggregation and fallback logic

## Notes

- Tests use mock data to avoid external API dependencies
- Core logic is tested in isolation
- Date parsing and filtering logic is thoroughly validated
- Form matching and scoring algorithms are verified

