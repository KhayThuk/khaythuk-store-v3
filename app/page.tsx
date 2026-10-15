'use client';

import { useState, useEffect } from 'react';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  title: string;
  duration: string;
  price: number;
  digitalData: string;
  expiresAt: string | null;
  category: Category;
}

export default function AdminDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [title, setTitle] = useState('');
  const [categoryName, setCategoryName] = useState('Netflix'); // หมวดหมู่เริ่มต้น
  const [duration, setDuration] = useState('');
  const [price, setPrice] = useState('');
  const [digitalData, setDigitalData] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      setProducts(data);
      
      // ดึงรายชื่อหมวดหมู่ที่ไม่ซ้ำกันมาแสดง
      const catsMap: { [key: string]: Category } = {};
      data.forEach((p: Product) => {
        if (p.category) catsMap[p.category.id] = p.category;
      });
      setCategories(Object.values(catsMap));
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        title, 
        categoryName: categoryName.trim(), 
        duration, 
        price, 
        digitalData, 
        expiresAt 
      }),
    });

    if (res.ok) {
      alert('เพิ่มรหัสสินค้าลงสต็อกสำเร็จ!');
      setTitle('');
      setDuration('');
      setPrice('');
      setDigitalData('');
      setExpiresAt('');
      fetchData();
    } else {
      alert('เกิดข้อผิดพลาดในการเพิ่มสินค้า');
    }
  };

  // จัดกลุ่มสินค้าตามหมวดหมู่เพื่อดูสต็อกคงเหลือ
  const groupedProducts = products.reduce((acc: { [key: string]: Product[] }, p) => {
    const catName = p.category?.name || 'อื่นๆ';
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(p);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-orange-400">🛡️ Admin Dashboard - จัดการสต็อกสินค้าดิจิทัล</h1>
          <p className="text-gray-400 text-sm mt-1">เพิ่มรหัสสินค้า แยกหมวดหมู่ และเช็คจำนวนสต็อกคงเหลือแบบเรียลไทม์</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ฟอร์มเพิ่มสินค้า */}
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl h-fit">
            <h2 className="text-xl font-semibold mb-4 text-orange-300">➕ เติมรหัสสินค้าเข้าสต็อก</h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">หมวดหมู่สินค้า</label>
                <input 
                  type="text" 
                  value={categoryName} 
                  onChange={(e) => setCategoryName(e.target.value)} 
                  required
                  placeholder="เช่น Netflix, YouTube, Disney+" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500 font-medium text-orange-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">ชื่อสินค้า / แพ็กเกจ</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  required
                  placeholder="เช่น Netflix 4K จอส่วนตัว 30วัน" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">จำนวนวันใช้งาน</label>
                  <input 
                    type="text" 
                    value={duration} 
                    onChange={(e) => setDuration(e.target.value)} 
                    required
                    placeholder="เช่น 30วัน" 
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">ราคา (บาท)</label>
                  <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    required
                    placeholder="129" 
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">วันหมดอายุของสินค้า (ถ้ามี)</label>
                <input 
                  type="date" 
                  value={expiresAt} 
                  onChange={(e) => setExpiresAt(e.target.value)} 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500 text-gray-300"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">ช่องข้อความรหัสสินค้า (Email / Password / Code)</label>
                <textarea 
                  rows={4}
                  value={digitalData} 
                  onChange={(e) => setDigitalData(e.target.value)} 
                  required
                  placeholder="Email: stock01@mail.com&#10;Password: xxxxxxx" 
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-2.5 rounded-lg transition duration-200"
              >
                เพิ่มรหัสเข้าสต็อก
              </button>
            </form>
          </div>

          {/* สรุปสต็อกและรายการแยกตามหมวดหมู่ */}
          <div className="lg:col-span-2 space-y-6">
            {Object.keys(groupedProducts).length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl text-center text-gray-500">
                ยังไม่มีสินค้าในระบบ กรุณาเพิ่มรหัสสินค้าทางด้านซ้าย
              </div>
            ) : (
              Object.entries(groupedProducts).map(([catName, items]) => (
                <div key={catName} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-orange-300">📂 หมวดหมู่: {catName}</h2>
                    <span className="bg-orange-500/20 text-orange-400 text-xs px-3 py-1 rounded-full font-medium">
                      คงเหลือในสต็อก: {items.length} ชิ้น
                    </span>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                      <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
                        <tr>
                          <th className="p-3 rounded-l-lg">ชื่อสินค้า</th>
                          <th className="p-3">ระยะเวลา</th>
                          <th className="p-3">ราคา</th>
                          <th className="p-3">ข้อมูลรหัส (สต็อก)</th>
                          <th className="p-3 rounded-r-lg">วันหมดอายุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {items.map((p) => (
                          <tr key={p.id}>
                            <td className="p-3 font-medium text-white">{p.title}</td>
                            <td className="p-3">{p.duration}</td>
                            <td className="p-3 text-orange-400">{p.price} ฿</td>
                            <td className="p-3 font-mono text-xs bg-gray-950 p-1.5 rounded whitespace-pre-line text-emerald-400">
                              {p.digitalData}
                            </td>
                            <td className="p-3 text-gray-400">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}