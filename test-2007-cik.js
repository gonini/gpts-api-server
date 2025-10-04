// Test 2007 CIK for GOOGL
const https = require('https');

async function test2007CIK() {
  try {
    console.log('Testing 2007 CIK for GOOGL...');
    
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
    
    // Search for Google-related entries
    const googleLines = lines.filter(line => 
      line.toLowerCase().includes('google') || 
      line.toLowerCase().includes('alphabet')
    );
    
    console.log(`Found ${googleLines.length} Google-related lines:`);
    googleLines.slice(0, 10).forEach((line, i) => {
      console.log(`${i + 1}: ${line}`);
    });
    
    // Also search for Apple and Microsoft
    const appleLines = lines.filter(line => 
      line.toLowerCase().includes('apple')
    );
    
    console.log(`\nFound ${appleLines.length} Apple-related lines:`);
    appleLines.slice(0, 5).forEach((line, i) => {
      console.log(`${i + 1}: ${line}`);
    });
    
    const microsoftLines = lines.filter(line => 
      line.toLowerCase().includes('microsoft')
    );
    
    console.log(`\nFound ${microsoftLines.length} Microsoft-related lines:`);
    microsoftLines.slice(0, 5).forEach((line, i) => {
      console.log(`${i + 1}: ${line}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

test2007CIK();

