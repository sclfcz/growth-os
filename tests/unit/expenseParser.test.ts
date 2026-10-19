import{describe,expect,it}from'vitest';import{guessCategory,parseExpense}from'@/server/core/expenseParser';
const today='2026-10-17';
describe('parseExpense',()=>{
 const cases:[string,number,string,string][]=[
  ['18.5 午饭',1850,'expense','午饭'],['午饭 18.5',1850,'expense','午饭'],['打车 23 昨天',2300,'expense','打车'],['+500 稿费',50000,'income','稿费'],['书 39.9',3990,'expense','书'],['地铁 4',400,'expense','地铁'],['今天咖啡 22',2200,'expense','咖啡'],['前天买菜 31',3100,'expense','买菜'],['¥12.50 奶茶',1250,'expense','奶茶'],['公交 2元',200,'expense','公交'],['工资 8000',800000,'income','工资'],['收款 80',8000,'income','收款'],['健身 199.99',19999,'expense','健身'],['10-16 午餐 30',3000,'expense','午餐'],['收入 1200 报销',120000,'income','报销']
 ];
 it.each(cases)('%s parses', (input,cents,kind,note)=>{const result=parseExpense(input,today);expect(result).not.toBeNull();expect(result?.amountCents).toBe(cents);expect(result?.kind).toBe(kind);expect(result?.note).toBe(note);});
 it('rejects text without a valid amount or a note',()=>{expect(parseExpense('午饭',today)).toBeNull();expect(parseExpense('0.001 午饭',today)).toBeNull();expect(parseExpense('500',today)).toBeNull();expect(parseExpense('2-31 午饭 10',today)).toBeNull();});
 it('guesses category from configured keywords',()=>{expect(guessCategory('下班打车', [{name:'交通',keywords:['地铁','打车']}])).toBe('交通');});
});
