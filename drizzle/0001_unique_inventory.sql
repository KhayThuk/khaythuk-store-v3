CREATE TABLE inventory_codes (
  id INTEGER PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  code TEXT NOT NULL UNIQUE CHECK(length(code) BETWEEN 1 AND 500),
  order_id TEXT REFERENCES orders(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE INDEX inventory_available ON inventory_codes(product_id,id) WHERE order_id IS NULL;
--> statement-breakpoint
CREATE INDEX inventory_order ON inventory_codes(order_id,id) WHERE order_id IS NOT NULL;
--> statement-breakpoint
UPDATE products SET stock=0,revision=revision+1 WHERE stock<>0;
--> statement-breakpoint
CREATE TRIGGER order_allocate AFTER INSERT ON orders
BEGIN
  UPDATE inventory_codes SET order_id=NEW.id WHERE id IN (
    SELECT id FROM inventory_codes WHERE product_id=NEW.product_id AND order_id IS NULL ORDER BY id LIMIT NEW.quantity
  );
  SELECT CASE WHEN (SELECT COUNT(*) FROM inventory_codes WHERE order_id=NEW.id)<>NEW.quantity
    THEN RAISE(ABORT,'inventory allocation incomplete') END;
END;
--> statement-breakpoint
CREATE TRIGGER inventory_received AFTER INSERT ON inventory_codes
BEGIN
  UPDATE products SET stock=stock+1,revision=revision+1 WHERE id=NEW.product_id;
END;
