#!/usr/bin/env node

/**
 * Script to update ticker-CIK mapping from SEC EDGAR company_tickers.json
 * This script fetches all public companies and updates the mapping JSON file
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const SEC_COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const MAPPING_FILE_PATH = path.join(__dirname, '../lib/data/ticker-cik-mapping.json');

/**
 * Fetch data from SEC EDGAR company_tickers.json
 */
async function fetchCompanyTickers() {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };

    https.get(SEC_COMPANY_TICKERS_URL, options, (res) => {
      let data = '';
      
      // Handle gzip compression
      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      }
      
      stream.on('data', (chunk) => {
        data += chunk;
      });
      
      stream.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
      
      stream.on('error', (error) => {
        reject(new Error(`Stream error: ${error.message}`));
      });
    }).on('error', (error) => {
      reject(new Error(`Failed to fetch data: ${error.message}`));
    });
  });
}

/**
 * Generate alternative names for a company
 */
function generateAltNames(ticker, companyName) {
  const altNames = [];
  
  // Add the company name in uppercase
  altNames.push(companyName.toUpperCase());
  
  // Common variations
  const variations = [
    companyName.replace(/\./g, ''), // Remove periods
    companyName.replace(/,/g, ''), // Remove commas
    companyName.replace(/&/g, 'AND'), // Replace & with AND
    companyName.replace(/INC\.?$/i, 'INC'), // Standardize INC
    companyName.replace(/CORP\.?$/i, 'CORP'), // Standardize CORP
    companyName.replace(/LLC\.?$/i, 'LLC'), // Standardize LLC
    companyName.replace(/LTD\.?$/i, 'LTD'), // Standardize LTD
  ];
  
  variations.forEach(variation => {
    if (variation !== companyName) {
      altNames.push(variation.toUpperCase());
    }
  });
  
  // Special cases for well-known companies
  const specialCases = {
    'GOOGL': ['GOOGLE INC', 'ALPHABET INC'],
    'AAPL': ['APPLE INC', 'APPLE COMPUTER INC'],
    'MSFT': ['MICROSOFT CORP', 'MICROSOFT CORPORATION'],
    'AMZN': ['AMAZON COM INC', 'AMAZON.COM INC'],
    'TSLA': ['TESLA INC', 'TESLA MOTORS INC'],
    'META': ['FACEBOOK INC', 'META PLATFORMS INC'],
    'JNJ': ['JOHNSON & JOHNSON', 'J&J'],
    'WMT': ['WAL-MART STORES INC', 'WALMART INC'],
    'XOM': ['EXXON MOBIL CORP', 'EXXON MOBIL'],
    'CVX': ['CHEVRON CORP', 'CHEVRON CORPORATION'],
    'VZ': ['VERIZON COMMUNICATIONS INC', 'VERIZON COMM'],
    'T': ['AT&T INC', 'AT&T CORP'],
    'NEE': ['NEXTERA ENERGY INC', 'NEXTERA ENERGY'],
    'DUK': ['DUKE ENERGY CORP', 'DUKE ENERGY'],
    'AMT': ['AMERICAN TOWER CORP', 'AMERICAN TOWER'],
    'LIN': ['LINDE PLC', 'LINDE AG'],
    'APD': ['AIR PRODUCTS & CHEMICALS INC', 'AIR PRODUCTS']
  };
  
  if (specialCases[ticker]) {
    altNames.push(...specialCases[ticker]);
  }
  
  // Remove duplicates and return
  return [...new Set(altNames)];
}

/**
 * Update the mapping file with all companies
 */
async function updateMapping() {
  try {
    console.log('🔄 Fetching company tickers from SEC EDGAR...');
    const companyData = await fetchCompanyTickers();
    
    console.log(`📊 Found ${Object.keys(companyData).length} companies`);
    
    const mapping = {};
    
    // Process each company
    Object.values(companyData).forEach((company, index) => {
      const ticker = company.ticker;
      const cik = company.cik_str.toString().padStart(10, '0');
      const companyName = company.title;
      
      if (ticker && cik && companyName) {
        mapping[ticker] = {
          ticker: ticker,
          cik: cik,
          companyName: companyName,
          altNames: generateAltNames(ticker, companyName)
        };
      }
      
      // Progress indicator
      if ((index + 1) % 1000 === 0) {
        console.log(`📝 Processed ${index + 1} companies...`);
      }
    });
    
    console.log(`✅ Generated mapping for ${Object.keys(mapping).length} companies`);
    
    // Write to file
    const jsonContent = JSON.stringify(mapping, null, 2);
    fs.writeFileSync(MAPPING_FILE_PATH, jsonContent);
    
    console.log(`💾 Updated mapping file: ${MAPPING_FILE_PATH}`);
    console.log(`📈 Total companies in mapping: ${Object.keys(mapping).length}`);
    
    // Show some examples
    const examples = Object.keys(mapping).slice(0, 5);
    console.log('\n📋 Examples:');
    examples.forEach(ticker => {
      const company = mapping[ticker];
      console.log(`  ${ticker}: ${company.companyName} (CIK: ${company.cik})`);
    });
    
  } catch (error) {
    console.error('❌ Error updating mapping:', error.message);
    process.exit(1);
  }
}

// Run the update
if (require.main === module) {
  updateMapping();
}

module.exports = { updateMapping, fetchCompanyTickers, generateAltNames };
