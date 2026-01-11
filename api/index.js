const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.db' 
  : path.join(__dirname, 'database.db');

const db = new sqlite3.Database(dbPath);

// CREATE TABLES WITH AUTO-INITIALIZATION
db.serialize(() => {
  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo TEXT DEFAULT 'fas fa-box',
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Accounts table
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    login_via TEXT DEFAULT 'Email',
    status TEXT DEFAULT 'available',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Product codes table
  db.run(`CREATE TABLE IF NOT EXISTS product_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    product_id INTEGER,
    account_id INTEGER,
    used BOOLEAN DEFAULT 0,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  )`);

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    message TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    replied_to INTEGER,
    status TEXT DEFAULT 'unread',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Check if we need to insert initial data
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (row.count === 0) {
      console.log('Initializing database with sample data...');
      
      // Insert sample products
      const sampleProducts = [
        ['NETFLIX001', 'Netflix Premium', 'Akun Netflix Premium 4K UHD, 4 screen', 'fas fa-film', 10],
        ['SPOTIFY001', 'Spotify Premium', 'Akun Spotify Premium Family', 'fab fa-spotify', 8],
        ['YOUTUBE001', 'YouTube Premium', 'YouTube Premium Family', 'fab fa-youtube', 5],
        ['DISCORD001', 'Discord Nitro', 'Discord Nitro 1 Tahun', 'fab fa-discord', 3],
        ['STEAM001', 'Steam Wallet', 'Steam Wallet Code $10', 'fab fa-steam', 15]
      ];

      const insertProduct = db.prepare(
        "INSERT INTO products (product_code, name, description, logo, stock) VALUES (?, ?, ?, ?, ?)"
      );

      sampleProducts.forEach(product => {
        insertProduct.run(product, (err) => {
          if (err) console.error('Error inserting product:', err);
        });
      });

      insertProduct.finalize();

      // Insert sample accounts after products are inserted
      setTimeout(() => {
        // Get product IDs
        db.all("SELECT id, product_code FROM products", (err, products) => {
          products.forEach(product => {
            let accountCount = 0;
            let sampleAccounts = [];
            
            if (product.product_code === 'NETFLIX001') {
              sampleAccounts = [
                [product.id, 'netflix1@example.com', 'netflix123', 'Email', 'Sample account 1'],
                [product.id, 'netflix2@example.com', 'netflix456', 'Email', 'Sample account 2'],
                [product.id, 'netflix3@example.com', 'netflix789', 'Email', 'Sample account 3']
              ];
            } else if (product.product_code === 'SPOTIFY001') {
              sampleAccounts = [
                [product.id, 'spotify1@example.com', 'spotify123', 'Email', 'Sample account'],
                [product.id, 'spotify2@example.com', 'spotify456', 'Email', 'Sample account']
              ];
            } else if (product.product_code === 'YOUTUBE001') {
              sampleAccounts = [
                [product.id, 'youtube1@example.com', 'youtube123', 'Email', 'Sample account']
              ];
            }

            const insertAccount = db.prepare(
              "INSERT INTO accounts (product_id, email, password, login_via, notes) VALUES (?, ?, ?, ?, ?)"
            );

            sampleAccounts.forEach(account => {
              insertAccount.run(account, (err) => {
                if (err) console.error('Error inserting account:', err);
              });
            });

            insertAccount.finalize();
          });

          console.log('Sample data initialization completed');
        });
      }, 1000);
    }
  });
});

// Database helper functions
const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Generate short code function
function generateShortCode(prefix = 'AMP') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const timestamp = Date.now().toString().slice(-4);
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${random}${timestamp}`;
}

// ============ API ROUTES ============

// 1. LOGIN API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (role === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        return res.json({
          success: true,
          role: 'admin',
          username: 'admin',
          name: 'Administrator'
        });
      }
      return res.status(401).json({ error: 'Invalid admin credentials' });
    } else {
      if (password === '1') {
        return res.json({
          success: true,
          role: 'user',
          username: username || 'user',
          name: username || 'User'
        });
      }
      return res.status(401).json({ error: 'Invalid password. Use password: 1' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. PRODUCTS API
app.get('/api/products', async (req, res) => {
  try {
    const products = await dbAll(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM accounts WHERE product_id = p.id AND status = 'available') as available_accounts
      FROM products p
      ORDER BY p.created_at DESC
    `);
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { product_code, name, description, logo, stock } = req.body;
    
    const result = await dbRun(
      `INSERT INTO products (product_code, name, description, logo, stock) VALUES (?, ?, ?, ?, ?)`,
      [product_code, name, description, logo || 'fas fa-box', stock || 0]
    );
    
    res.json({ 
      success: true,
      productId: result.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, logo, stock } = req.body;
    
    await dbRun(
      `UPDATE products SET name = ?, description = ?, logo = ?, stock = ? WHERE id = ?`,
      [name, description, logo, stock, req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    // Delete related codes first
    await dbRun('DELETE FROM product_codes WHERE product_id = ?', [req.params.id]);
    // Delete related accounts
    await dbRun('DELETE FROM accounts WHERE product_id = ?', [req.params.id]);
    // Delete product
    await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. ACCOUNTS API
app.get('/api/products/:id/accounts', async (req, res) => {
  try {
    const accounts = await dbAll(
      `SELECT a.* FROM accounts a 
       WHERE a.product_id = ? 
       ORDER BY a.status, a.id DESC`,
      [req.params.id]
    );
    
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id/available-accounts', async (req, res) => {
  try {
    const accounts = await dbAll(
      `SELECT a.* FROM accounts a 
       WHERE a.product_id = ? AND a.status = 'available'
       ORDER BY a.id DESC`,
      [req.params.id]
    );
    
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const { product_id, email, password, login_via, notes } = req.body;
    
    // Check if product exists
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const result = await dbRun(
      `INSERT INTO accounts (product_id, email, password, login_via, notes) VALUES (?, ?, ?, ?, ?)`,
      [product_id, email, password, login_via || 'Email', notes || '']
    );
    
    // Update product stock
    await dbRun(
      `UPDATE products SET stock = stock + 1 WHERE id = ?`,
      [product_id]
    );
    
    res.json({ 
      success: true,
      accountId: result.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts/bulk', async (req, res) => {
  try {
    const { product_id, accounts } = req.body;
    
    // Check if product exists
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    let added = 0;
    let failed = 0;
    
    for (const acc of accounts) {
      if (acc.email && acc.password) {
        try {
          await dbRun(
            `INSERT INTO accounts (product_id, email, password, login_via, notes) VALUES (?, ?, ?, ?, ?)`,
            [product_id, acc.email, acc.password, acc.login_via || 'Email', acc.notes || '']
          );
          added++;
        } catch (err) {
          failed++;
        }
      }
    }
    
    // Update product stock
    await dbRun(
      `UPDATE products SET stock = stock + ? WHERE id = ?`,
      [added, product_id]
    );
    
    res.json({ 
      success: true,
      added: added,
      failed: failed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts/import', async (req, res) => {
  try {
    const { product_id, text } = req.body;
    
    // Check if product exists
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const lines = text.split('\n').filter(line => line.trim() !== '');
    let imported = 0;
    let failed = 0;
    
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        try {
          await dbRun(
            `INSERT INTO accounts (product_id, email, password, login_via) VALUES (?, ?, ?, ?)`,
            [product_id, parts[0], parts[1], parts[2] || 'Email']
          );
          imported++;
        } catch (err) {
          failed++;
        }
      }
    }
    
    // Update product stock
    await dbRun(
      `UPDATE products SET stock = stock + ? WHERE id = ?`,
      [imported, product_id]
    );
    
    res.json({ 
      success: true,
      imported: imported,
      failed: failed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    // Get account info before deleting
    const account = await dbGet(
      'SELECT product_id FROM accounts WHERE id = ?',
      [req.params.id]
    );
    
    if (account) {
      // Update product stock
      await dbRun(
        `UPDATE products SET stock = stock - 1 WHERE id = ?`,
        [account.product_id]
      );
    }
    
    await dbRun('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. CODES API
app.post('/api/codes/generate', async (req, res) => {
  try {
    const { product_id, account_id, custom_prefix } = req.body;
    
    // Check if product exists
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check if account exists and is available
    const account = await dbGet(
      'SELECT * FROM accounts WHERE id = ? AND product_id = ? AND status = "available"',
      [account_id, product_id]
    );
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found or not available' });
    }
    
    // Generate unique code
    const prefix = custom_prefix || product.product_code.substring(0, 3).toUpperCase();
    let code;
    let attempts = 0;
    
    do {
      code = generateShortCode(prefix);
      const existing = await dbGet('SELECT * FROM product_codes WHERE code = ?', [code]);
      attempts++;
      if (attempts > 10) {
        return res.status(500).json({ error: 'Failed to generate unique code' });
      }
    } while (existing);
    
    // Insert code
    const result = await dbRun(
      'INSERT INTO product_codes (code, product_id, account_id) VALUES (?, ?, ?)',
      [code, product_id, account_id]
    );
    
    // Mark account as reserved
    await dbRun('UPDATE accounts SET status = "reserved" WHERE id = ?', [account_id]);
    
    res.json({ 
      success: true,
      code: code,
      codeId: result.id
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/codes/generate-multiple', async (req, res) => {
  try {
    const { product_id, count, custom_prefix } = req.body;
    
    // Check if product exists
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get available accounts
    const availableAccounts = await dbAll(
      'SELECT * FROM accounts WHERE product_id = ? AND status = "available" LIMIT ?',
      [product_id, count]
    );
    
    if (availableAccounts.length < count) {
      return res.status(400).json({ 
        error: `Only ${availableAccounts.length} accounts available (requested: ${count})` 
      });
    }
    
    const prefix = custom_prefix || product.product_code.substring(0, 3).toUpperCase();
    const generatedCodes = [];
    
    for (const account of availableAccounts) {
      let code;
      let attempts = 0;
      
      do {
        code = generateShortCode(prefix);
        const existing = await dbGet('SELECT * FROM product_codes WHERE code = ?', [code]);
        attempts++;
        if (attempts > 10) {
          throw new Error('Failed to generate unique code');
        }
      } while (existing);
      
      // Insert code
      await dbRun(
        'INSERT INTO product_codes (code, product_id, account_id) VALUES (?, ?, ?)',
        [code, product_id, account.id]
      );
      
      // Mark account as reserved
      await dbRun('UPDATE accounts SET status = "reserved" WHERE id = ?', [account.id]);
      
      generatedCodes.push({
        code: code,
        account_id: account.id,
        email: account.email
      });
    }
    
    res.json({ 
      success: true,
      codes: generatedCodes
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/codes/:product_id', async (req, res) => {
  try {
    const codes = await dbAll(`
      SELECT pc.*, a.email, a.status as account_status, p.name as product_name
      FROM product_codes pc
      LEFT JOIN accounts a ON pc.account_id = a.id
      LEFT JOIN products p ON pc.product_id = p.id
      WHERE pc.product_id = ? 
      ORDER BY pc.created_at DESC
    `, [req.params.product_id]);
    
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. REDEEM API
app.post('/api/redeem', async (req, res) => {
  try {
    const { code } = req.body;
    
    // Find unused code with account info
    const productCode = await dbGet(`
      SELECT pc.*, p.name as product_name, a.email, a.password, a.login_via, a.id as account_id
      FROM product_codes pc
      JOIN products p ON pc.product_id = p.id
      JOIN accounts a ON pc.account_id = a.id
      WHERE pc.code = ? AND pc.used = 0
    `, [code]);
    
    if (!productCode) {
      return res.status(404).json({ error: 'Invalid or used code' });
    }
    
    // Start transaction
    await dbRun('BEGIN TRANSACTION');
    
    try {
      // Mark code as used
      await dbRun(
        'UPDATE product_codes SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [productCode.id]
      );
      
      // Mark account as used
      await dbRun(
        'UPDATE accounts SET status = "used" WHERE id = ?',
        [productCode.account_id]
      );
      
      // Update product stock
      await dbRun(
        'UPDATE products SET stock = stock - 1 WHERE id = ?',
        [productCode.product_id]
      );
      
      await dbRun('COMMIT');
      
      res.json({
        success: true,
        account: {
          email: productCode.email,
          password: productCode.password,
          login_via: productCode.login_via,
          product: productCode.product_name
        }
      });
      
    } catch (error) {
      await dbRun('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. MESSAGES API
app.post('/api/messages', async (req, res) => {
  try {
    const { user_id, username, message, role } = req.body;
    
    const result = await dbRun(
      `INSERT INTO messages (user_id, username, message, role) VALUES (?, ?, ?, ?)`,
      [user_id || 'anonymous', username || 'User', message, role || 'user']
    );
    
    res.json({ 
      success: true,
      messageId: result.id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    let query = `SELECT * FROM messages`;
    let params = [];
    
    if (user_id) {
      query += ` WHERE user_id = ?`;
      params.push(user_id);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 50`;
    
    const messages = await dbAll(query, params);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/unread/count', async (req, res) => {
  try {
    const count = await dbGet(
      `SELECT COUNT(*) as count FROM messages WHERE status = 'unread' AND role = 'user'`
    );
    res.json({ count: count.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/messages/:id/read', async (req, res) => {
  try {
    await dbRun(`UPDATE messages SET status = 'read' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. STATISTICS API
app.get('/api/stats', async (req, res) => {
  try {
    const productsCount = await dbGet(`SELECT COUNT(*) as count FROM products`);
    const accountsCount = await dbGet(`SELECT COUNT(*) as count FROM accounts`);
    const availableAccounts = await dbGet(`SELECT COUNT(*) as count FROM accounts WHERE status = 'available'`);
    const codesCount = await dbGet(`SELECT COUNT(*) as count FROM product_codes`);
    const usedCodes = await dbGet(`SELECT COUNT(*) as count FROM product_codes WHERE used = 1`);
    
    res.json({
      products: productsCount.count,
      totalAccounts: accountsCount.count,
      availableAccounts: availableAccounts.count,
      totalCodes: codesCount.count,
      usedCodes: usedCodes.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. HEALTH CHECK API
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    await dbGet('SELECT 1 as ok');
    
    const stats = await dbGet(`
      SELECT 
        (SELECT COUNT(*) FROM products) as products,
        (SELECT COUNT(*) FROM accounts) as accounts,
        (SELECT COUNT(*) FROM product_codes) as codes
    `);
    
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      stats: stats
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// 9. RESET DATABASE API (for testing only)
app.post('/api/reset-database', async (req, res) => {
  try {
    // Drop all tables
    await dbRun('DROP TABLE IF EXISTS messages');
    await dbRun('DROP TABLE IF EXISTS product_codes');
    await dbRun('DROP TABLE IF EXISTS accounts');
    await dbRun('DROP TABLE IF EXISTS products');
    
    // Recreate tables
    db.serialize(() => {
      db.run(`CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        logo TEXT DEFAULT 'fas fa-box',
        stock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        login_via TEXT DEFAULT 'Email',
        status TEXT DEFAULT 'available',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`);

      db.run(`CREATE TABLE product_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        product_id INTEGER,
        account_id INTEGER,
        used BOOLEAN DEFAULT 0,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )`);

      db.run(`CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        username TEXT,
        message TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        replied_to INTEGER,
        status TEXT DEFAULT 'unread',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    });
    
    res.json({ 
      success: true,
      message: 'Database reset successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/user.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Database: ${dbPath}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
