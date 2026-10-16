import type { ServiceCategory } from '../types/content'

// Services and prices: the starting data of the booking system (Thai only, N3). The names, descriptions,
// lengths and prices are those of Business-site (app/data/services.ts), made up for the demo brand.
// The first screen of the booking shows every category in this order; the back office can change prices,
// add services and close a service for a while.
//
// Each category has a photo from public/images/ (credited in CREDITS.md). To add a service, add an item
// with a unique `id` and one to four `options` (minutes, price in baht), shortest first.
//
// Like site.ts, this file is also read outside Nuxt (tests, the back end's seed), so it only imports types.
export const serviceCategories: readonly ServiceCategory[] = [
  {
    id: 'thai',
    name: 'นวดไทย',
    description: 'กดจุดและยืดเหยียดตามแนวเส้นแบบไทยดั้งเดิม ใส่ชุดนวดที่ร้านเตรียมไว้ให้',
    image: { file: 'svc-thai.webp', width: 640, height: 480 },
    items: [
      {
        id: 'thai-traditional',
        name: 'นวดแผนไทย',
        description: 'กดจุดและยืดเหยียดตามแนวเส้นแบบไทยดั้งเดิม คลายความตึงจากการนั่งทำงานนาน ๆ ตัวเบา นอนหลับสบาย',
        options: [
          { minutes: 60, price: 400 },
          { minutes: 90, price: 550 },
          { minutes: 120, price: 700 },
        ],
      },
      {
        id: 'thai-herbal-compress',
        name: 'นวดไทย + ประคบสมุนไพร',
        description: 'นวดไทยต่อด้วยลูกประคบไพลนึ่งร้อน ช่วยลดอาการปวดเมื่อยและคลายกล้ามเนื้อส่วนลึก หอมสมุนไพรติดตัว',
        options: [
          { minutes: 90, price: 900 },
          { minutes: 120, price: 1100 },
        ],
      },
      {
        id: 'foot-reflexology',
        name: 'นวดฝ่าเท้า',
        description: 'แช่เท้าน้ำอุ่นสมุนไพร แล้วกดจุดฝ่าเท้าด้วยไม้นวด เหมาะกับวันที่เดินมาทั้งวัน',
        options: [
          { minutes: 45, price: 300 },
          { minutes: 60, price: 350 },
        ],
      },
      {
        id: 'neck-shoulder',
        name: 'นวดคอ บ่า ไหล่',
        description: 'เน้นคอ บ่า ไหล่ และหลังส่วนบน สำหรับคนที่ใช้คอมพิวเตอร์หรือมือถือนาน ๆ',
        options: [
          { minutes: 30, price: 250 },
          { minutes: 60, price: 400 },
        ],
      },
    ],
  },
  {
    id: 'oil',
    name: 'นวดน้ำมัน',
    description: 'ลงน้ำหนักนุ่มนวลต่อเนื่องด้วยน้ำมันอุ่น เลือกกลิ่นได้ก่อนเริ่มนวด',
    image: { file: 'svc-oil.webp', width: 640, height: 480 },
    items: [
      {
        id: 'aroma-oil',
        name: 'นวดน้ำมันอโรมา',
        description: 'น้ำมันหอมระเหยอุ่น ๆ เลือกกลิ่นได้ 4 แบบ ลงน้ำหนักนุ่มนวลต่อเนื่องทั้งตัว เหมาะกับวันที่อยากพักจริง ๆ',
        options: [
          { minutes: 60, price: 750 },
          { minutes: 90, price: 1000 },
          { minutes: 120, price: 1300 },
        ],
      },
      {
        id: 'deep-tissue-oil',
        name: 'นวดน้ำมันคลายกล้ามเนื้อ',
        description: 'ลงน้ำหนักลึกกว่านวดอโรมา เน้นจุดที่ตึงจากการออกกำลังกายหรือทำงานหนัก',
        options: [
          { minutes: 60, price: 850 },
          { minutes: 90, price: 1150 },
        ],
      },
      {
        id: 'hot-stone',
        name: 'นวดหินร้อน',
        description: 'นวดน้ำมันร่วมกับหินร้อนที่วางตามแนวหลัง ความร้อนช่วยให้กล้ามเนื้อคลายตัวเร็วขึ้น',
        options: [
          { minutes: 90, price: 1400 },
        ],
      },
    ],
  },
  {
    id: 'facial',
    name: 'สปาหน้า',
    description: 'ดูแลผิวหน้าด้วยสมุนไพรไทยและการนวดหน้าที่ช่วยให้ผ่อนคลาย',
    image: { file: 'about.webp', width: 600, height: 800 },
    items: [
      {
        id: 'herbal-facial',
        name: 'สปาหน้าสมุนไพรไทย',
        description: 'ล้างหน้า ขัดผิวด้วยขมิ้นและน้ำผึ้ง พอกหน้าสมุนไพร และนวดหน้า',
        options: [
          { minutes: 60, price: 900 },
        ],
      },
      {
        id: 'face-head-massage',
        name: 'นวดหน้าและศีรษะ',
        description: 'นวดกดจุดบนใบหน้า ขมับ และศีรษะ ช่วยคลายความเครียดและอาการตาล้า',
        options: [
          { minutes: 30, price: 350 },
          { minutes: 60, price: 600 },
        ],
      },
    ],
  },
  {
    id: 'package',
    name: 'แพ็กเกจ',
    description: 'รวมหลายบริการไว้ในครั้งเดียว ราคาถูกกว่าจองแยก',
    image: { file: 'svc-compress.webp', width: 640, height: 480 },
    items: [
      {
        id: 'package-relax',
        name: 'แพ็กเกจผ่อนคลาย',
        description: 'เริ่มด้วยนวดไทยคลายเส้น แล้วต่อด้วยนวดน้ำมันอโรมาทั้งตัว',
        options: [
          { minutes: 120, price: 1500 },
        ],
        includes: 'นวดแผนไทย 60 นาที + นวดน้ำมันอโรมา 60 นาที',
      },
      {
        id: 'package-nuanplai',
        name: 'แพ็กเกจนวลไพล',
        description: 'ครบทั้งตัวและผิวหน้า สำหรับวันที่อยากให้รางวัลตัวเอง',
        options: [
          { minutes: 180, price: 2400 },
        ],
        includes: 'ขัดผิวสมุนไพร 30 นาที + นวดน้ำมันอโรมา 90 นาที + สปาหน้าสมุนไพรไทย 60 นาที',
      },
    ],
  },
]
