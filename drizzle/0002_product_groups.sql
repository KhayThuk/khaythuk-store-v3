CREATE TABLE product_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cover_category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT
);
--> statement-breakpoint
ALTER TABLE products ADD COLUMN group_id TEXT REFERENCES product_groups(id);
--> statement-breakpoint
ALTER TABLE products ADD COLUMN days INTEGER CHECK(days BETWEEN 1 AND 3650);
--> statement-breakpoint
ALTER TABLE products ADD COLUMN shares INTEGER CHECK(shares BETWEEN 1 AND 100);
--> statement-breakpoint
INSERT INTO product_groups(id,name,cover_category)
SELECT lower(hex(randomblob(16))),category,category FROM products GROUP BY category;
--> statement-breakpoint
UPDATE products SET group_id=(SELECT id FROM product_groups WHERE name=products.category),
  days=CASE WHEN name LIKE '% 90 วัน%' THEN 90 WHEN name LIKE '% 30 วัน%' THEN 30
    WHEN name LIKE '% 7 วัน%' THEN 7 WHEN name LIKE '% 1 วัน%' THEN 1 END,
  shares=CASE WHEN name LIKE '%แชร์ 4%' THEN 4 WHEN name LIKE '%แชร์ 3%' THEN 3
    WHEN name LIKE '%แชร์ 2%' THEN 2 END;
--> statement-breakpoint
CREATE INDEX products_by_group ON products(group_id);
