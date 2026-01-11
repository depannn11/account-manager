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

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    login_via TEXT,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS product_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    product_id INTEGER,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
});

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

app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('Login attempt:', { username, password, role });

    if (role === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        console.log('Admin login successful');
        return res.json({
          success: true,
          role: 'admin',
          username: 'admin'
        });
      }
      console.log('Admin login failed');
      return res.status(401).json({ error: 'Invalid admin credentials' });
    } else {
      if (password === '1') {
        console.log('User login successful');
        return res.json({
          success: true,
          role: 'user',
          username: username || 'user'
        });
      }
      console.log('User login failed');
      return res.status(401).json({ error: 'Invalid password. Use password: 1' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await dbAll(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM accounts WHERE product_id = p.id AND status = 'available') as available_accounts
      FROM products p
      WHERE p.stock > 0
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
    const { product_code, name, description, stock } = req.body;
    
    const result = await dbRun(
      `INSERT INTO products (product_code, name, description, stock) VALUES (?, ?, ?, ?)`,
      [product_code, name, description, stock]
    );
    
    res.json({ 
      success: true,
      productId: result.id 
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, stock } = req.body;
    
    await dbRun(
      `UPDATE products SET name = ?, description = ?, stock = ? WHERE id = ?`,
      [name, description, stock, req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id/accounts', async (req, res) => {
  try {
    const accounts = await dbAll(
      `SELECT a.* FROM accounts a 
       WHERE a.product_id = ? 
       ORDER BY a.status, a.id`,
      [req.params.id]
    );
    
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const { product_id, email, password, login_via } = req.body;
    
    const result = await dbRun(
      `INSERT INTO accounts (product_id, email, password, login_via) VALUES (?, ?, ?, ?)`,
      [product_id, email, password, login_via]
    );
    
    await dbRun(`UPDATE products SET stock = stock + 1 WHERE id = ?`, [product_id]);
    
    res.json({ 
      success: true,
      accountId: result.id 
    });
  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const account = await dbGet('SELECT product_id FROM accounts WHERE id = ?', [req.params.id]);
    
    if (account) {
      await dbRun(`UPDATE products SET stock = stock - 1 WHERE id = ?`, [account.product_id]);
    }
    
    await dbRun('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/codes/generate', async (req, res) => {
  try {
    const { product_id, count } = req.body;
    
    const product = await dbGet('SELECT product_code FROM products WHERE id = ?', [product_id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const generatedCodes = [];
    
    for (let i = 0; i < count; i++) {
      const code = `${product.product_code}-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      await dbRun('INSERT INTO product_codes (code, product_id) VALUES (?, ?)', [code, product_id]);
      
      generatedCodes.push(code);
    }
    
    res.json({ 
      success: true,
      codes: generatedCodes 
    });
  } catch (error) {
    console.error('Error generating codes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/codes/:product_id', async (req, res) => {
  try {
    const codes = await dbAll(
      `SELECT * FROM product_codes WHERE product_id = ? ORDER BY created_at DESC`,
      [req.params.product_id]
    );
    
    res.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/redeem', async (req, res) => {
  try {
    const { code } = req.body;
    
    const productCode = await dbGet(
      `SELECT pc.*, p.name as product_name, p.product_code as product_code 
       FROM product_codes pc
       JOIN products p ON pc.product_id = p.id
       WHERE pc.code = ? AND pc.used = 0`,
      [code]
    );
    
    if (!productCode) {
      return res.status(404).json({ error: 'Invalid or used code' });
    }
    
    const account = await dbGet(
      `SELECT * FROM accounts 
       WHERE product_id = ? AND status = 'available' 
       LIMIT 1`,
      [productCode.product_id]
    );
    
    if (!account) {
      return res.status(404).json({ error: 'No accounts available' });
    }
    
    await dbRun('BEGIN TRANSACTION');
    
    try {
      await dbRun(`UPDATE product_codes SET used = 1 WHERE id = ?`, [productCode.id]);
      
      await dbRun(`UPDATE accounts SET status = 'used' WHERE id = ?`, [account.id]);
      
      await dbRun(`UPDATE products SET stock = stock - 1 WHERE id = ?`, [productCode.product_id]);
      
      await dbRun('COMMIT');
      
      res.json({
        success: true,
        account: {
          email: account.email,
          password: account.password,
          login_via: account.login_via,
          product: productCode.product_name
        }
      });
      
    } catch (error) {
      await dbRun('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error redeeming code:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/user.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
