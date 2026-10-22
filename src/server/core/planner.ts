export type DailyPlanInput = {
 budgetMinutes:number; dueCount:number; backlogCount?:number; backlogCapacity?:number;
 dayType?:'normal'|'rest'|'sick'|'exam'; newItemMinutes?:number; reviewMinutes?:number;
 optionalRestReviews?:number; minNewPerDay?:number; maxNewPerDay?:number;
};
export type DailyPlan = {reviews:number;newItems:number;backlog:number;minutes:number;mode:'normal'|'clearing'|'rest'};
export function buildDailyPlan(input:DailyPlanInput):DailyPlan{
 const {budgetMinutes,dueCount,dayType='normal',newItemMinutes=25,reviewMinutes=15,backlogCount=0,backlogCapacity=Math.floor(budgetMinutes*.7/reviewMinutes),minNewPerDay=1,maxNewPerDay=4}=input;
 if(dayType==='rest'||dayType==='sick'){
  const reviews=Math.min(dueCount,input.optionalRestReviews??2);
  return{reviews,newItems:0,backlog:Math.max(0,dueCount-reviews)+backlogCount,minutes:reviews*reviewMinutes,mode:'rest'};
 }
 const reviewCap=Math.floor(budgetMinutes*.7/reviewMinutes);
 const reviews=Math.min(dueCount,reviewCap);
 const backlog=Math.max(0,dueCount-reviews)+backlogCount;
 if(backlog>backlogCapacity*2){const protectedNew=Math.min(Math.max(1,minNewPerDay),maxNewPerDay);return{reviews,newItems:protectedNew,backlog,minutes:reviews*reviewMinutes+protectedNew*newItemMinutes,mode:'clearing'};}
 const remaining=Math.max(0,budgetMinutes-reviews*reviewMinutes);
 const capacity=Math.floor(remaining/newItemMinutes);
 const newItems=capacity===0?0:Math.min(maxNewPerDay,Math.max(Math.min(minNewPerDay,capacity),capacity));
 return{reviews,newItems,backlog,minutes:reviews*reviewMinutes+newItems*newItemMinutes,mode:'normal'};
}
