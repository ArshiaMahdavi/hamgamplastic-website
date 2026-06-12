require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../server/product.model');

const seedPath = process.argv[2] || path.join(process.cwd(), 'seed', 'products.json');

function normalizeProduct(product) {
  const name = product.name || product.title;
  return {
    legacyId: product.legacyId || product.id || product.slug,
    name,
    title: product.title || name,
    price: Number(String(product.price || 0).replace(/[^\d.]/g, '')),
    category: product.category || 'عمومی',
    image: product.image || product.img || product.imageUrl || '',
    description: product.description || product.desc || '',
    rating: Number(product.rating || 0),
    stock: Number(product.stock ?? product.inventory ?? (product.isAvailable === false ? 0 : 1)),
    isAvailable: product.isAvailable !== false,
    isActive: product.isActive !== false,
    isFeatured: Boolean(product.isFeatured || product.featured),
  };
}

async function main() {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const products = Array.isArray(raw) ? raw : raw.products;
  if (!Array.isArray(products)) throw new Error('Seed file must be an array or { "products": [] }');

  await mongoose.connect(process.env.MONGODB_URI);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const source of products) {
    const product = normalizeProduct(source);
    if (!product.name || !Number.isFinite(product.price)) {
      skipped += 1;
      continue;
    }

    const existing = await Product.findOne({
      $or: [
        product.legacyId ? { legacyId: product.legacyId } : null,
        { name: product.name },
        { title: product.title },
      ].filter(Boolean),
    });

    if (existing) {
      await Product.updateOne({ _id: existing._id }, { $setOnInsert: product });
      skipped += 1;
      continue;
    }

    await Product.create(product);
    created += 1;
  }

  const total = await Product.countDocuments();
  console.log(JSON.stringify({ created, skipped, updated, total }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
