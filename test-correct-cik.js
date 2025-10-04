// Test with correct 2007 CIKs
const https = require('https');

async function testCorrectCIK() {
  try {
    console.log('Testing with correct 2007 CIKs...');
    
    const indexUrl = 'https://www.sec.gov/Archives/edgar/full-index/2007/QTR1/master.idx';
    console.log(`Fetching ${indexUrl}`);
    
    const response = await fetch(indexUrl, {
      headers: {
        'User-Agent': 'gongui-sec-client/1.0 (contact: noreply@example.com)',
        'Accept': 'text/plain',
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch: ${response.status}`);
      return;
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    console.log(`Found ${lines.length} lines`);
    
    // Test with correct CIKs
    const correctCIKs = {
      'GOOGL': '1288776',
      'MSFT': '789019',
      'AAPL': '320193' // Apple's CIK
    };
    
    for (const [ticker, cik] of Object.entries(correctCIKs)) {
      console.log(`\n=== Testing ${ticker} with CIK ${cik} ===`);
      
      const matchingLines = lines.filter(line => {
        const parts = line.split('|');
        if (parts.length < 5) return false;
        const [lineCik, company, form, dateFiled, filename] = parts;
        return lineCik === cik && ['10-K', '10-Q', '8-K'].includes(form);
      });
      
      console.log(`Found ${matchingLines.length} matching filings:`);
      matchingLines.slice(0, 5).forEach((line, i) => {
        const parts = line.split('|');
        const [lineCik, company, form, dateFiled, filename] = parts;
        console.log(`${i + 1}: ${form} on ${dateFiled} - ${company}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testCorrectCIK();

