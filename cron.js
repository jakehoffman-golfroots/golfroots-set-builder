const cron = require('node-cron');

const SYNC_URL = process.env.APP_URL || 'https://respectful-analysis-production.up.railway.app';

console.log('🕒 Cron scheduler started - Running every 15 minutes');
console.log('📍 Sync URL:', SYNC_URL);

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('⏰ Running product sync at', new Date().toISOString());
  
  try {
    const response = await fetch(`${SYNC_URL}/api/sync-products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Sync completed successfully - Synced', data.syncedCount || 0, 'products');
    } else {
      const errorText = await response.text();
      console.error('❌ Sync failed:', response.status, errorText);
    }
  } catch (error) {
    console.error('❌ Sync error:', error.message);
  }
});

// Test sync on startup
console.log('🧪 Running initial sync on startup...');
fetch(`${SYNC_URL}/api/sync-products`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
  .then(res => res.json())
  .then(data => console.log('✅ Initial sync completed:', data.syncedCount || 0, 'products synced'))
  .catch(err => console.error('❌ Initial sync failed:', err.message));

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('👋 Shutting down cron scheduler');
  process.exit(0);
});