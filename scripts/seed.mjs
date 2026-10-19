import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
const dbPath=process.env.DATABASE_PATH||'/app/data/growth.db';
const db=new Database(dbPath);
const dataPath=path.join(process.cwd(),'seed/hot100.json');
const seed=JSON.parse(fs.readFileSync(dataPath,'utf8'));
const tx=db.transaction(()=>{
 let deck=db.prepare('SELECT id FROM decks WHERE name=?').get(seed.deck);
 if(!deck){const result=db.prepare('INSERT INTO decks(name,sort_order,max_new_per_day,weight) VALUES (?,0,5,1)').run(seed.deck);deck={id:Number(result.lastInsertRowid)};}
 const insert=db.prepare("INSERT OR IGNORE INTO items(deck_id,slug,title,url,difficulty,category,sort_order,status,stage,lapses) VALUES (?,?,?,?,?,?,?,'new',0,0)");
 for(const item of seed.items)insert.run(deck.id,item.slug,item.title,item.url,item.difficulty,item.category,item.order-1);
 const defaults=[['餐饮','expense',['饭','餐','奶茶']],['交通','expense',['地铁','打车','公交']],['学习与工具','expense',['书','课','api','token','服务器']],['日用','expense',['日用','超市']],['娱乐','expense',['电影','游戏']],['恋爱社交','expense',['礼物','聚餐']],['健身','expense',['健身','训练']],['医疗','expense',['医院','药']],['其他','expense',[]],['稿费 / 公众号','income',['稿费','公众号']],['工资','income',['工资']],['生活费','income',['生活费']],['其他收入','income',[]]];
 const insertCategory=db.prepare('INSERT INTO expense_categories(name,kind,keywords,sort_order) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name=?)');
 defaults.forEach((value,index)=>insertCategory.run(value[0],value[1],JSON.stringify(value[2]),index,value[0]));
});
tx();db.close();console.log('Seed data initialized');
