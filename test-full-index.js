// Test full-index function directly
const https = require('https');

async function testFullIndex() {
  try {
    const cik = '0001652044'; // GOOGL
    const from = '2007-01-01';
    const to = '2007-12-31';
    
    console.log(`Testing full-index for CIK ${cik} from ${from} to ${to}`);
    
    const fromDt = new Date(from);
    const toDt = new Date(to);
    const out = [];
    
    const startYear = fromDt.getFullYear();
    const endYear = toDt.getFullYear();
    
    console.log(`Scanning years ${startYear} to ${endYear}`);
    
    for (let year = startYear; year <= endYear; year++) {
      for (let qtr = 1; qtr <= 4; qtr++) {
        try {
          const indexUrl = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${qtr}/master.idx`;
          console.log(`Fetching ${indexUrl}`);
          
          const response = await fetch(indexUrl, {
            headers: {
              'User-Agent': 'gongui-sec-client/1.0 (contact: noreply@example.com)',
              'Accept': 'text/plain',
            }
          });
          
          if (!response.ok) {
            console.log(`Failed to fetch ${indexUrl}: ${response.status}`);
            continue;
          }
          
          const text = await response.text();
          const lines = text.split('\n');
          console.log(`Found ${lines.length} lines in ${year}Q${qtr}`);
          
          for (const line of lines) {
            if (!line.trim() || line.startsWith('CIK')) continue;
            
            const parts = line.split('|');
            if (parts.length < 5) continue;
            
            const [lineCik, company, form, dateFiled, filename] = parts;
            if (lineCik !== cik) continue;
            
            const fDate = new Date(dateFiled);
            if (isNaN(fDate.getTime())) continue;
            if (fDate < fromDt || fDate > toDt) continue;
            
            console.log(`Found matching filing: ${form} on ${dateFiled}`);
            out.push({
              form,
              filingDate: dateFiled,
              companyName: company,
              primaryDocument: filename
            });
          }
        } catch (e) {
          console.warn(`Full-index ${year}Q${qtr} failed: ${e.message}`);
        }
      }
    }
    
    console.log(`Found ${out.length} total filings`);
    console.log(JSON.stringify(out, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFullIndex();
