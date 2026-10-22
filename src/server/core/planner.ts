export type DailyPlanInput = {
 budgetMinutes:number; dueCount:number; backlogCount?:number; backlogCapacity?:number;
 dayType?:'normal'|'rest'|'sick'|'exam'; newItemMinutes?:number; reviewMinutes?:number;
 optionalRestReviews?:number; minNewPerDay?:number; maxNewPerDay?:number; dailyQuestionLimit?:number;
};
export type DailyPlan = {reviews:number;newItems:number;backlog:number;minutes:number;mode:'normal'|'clearing'|'rest'};
export function buildDailyPlan(input:DailyPlanInput):DailyPlan{
 const {budgetMinutes,dueCount,dayType='normal',newItemMinutes=25,reviewMinutes=15,backlogCount=0,backlogCapacity=Math.floor(budgetMinutes*.7/reviewMinutes),minNewPerDay=1,maxNewPerDay=2,dailyQuestionLimit=4}=input;
 if(dayType==='rest'||dayType==='sick'){
  const reviews=Math.min(dueCount,input.optionalRestReviews??2);
  return{reviews,newItems:0,backlog:Math.max(0,dueCount-reviews)+backlogCount,minutes:reviews*reviewMinutes,mode:'rest'};
 }
 // Reserve one slot for a new problem while due reviews are heavy; on lighter
 // days, target two new problems. The daily cap remains a hard limit of four.
 const reviewCap=Math.min(Math.floor(budgetMinutes*.7/reviewMinutes),Math.max(0,Math.min(3,dailyQuestionLimit-1)));
 const reviews=Math.min(dueCount,reviewCap);
 const backlog=Math.max(0,dueCount-reviews)+backlogCount;
 const targetNew=dueCount>=3?Math.max(1,minNewPerDay):maxNewPerDay;
 if(backlog>backlogCapacity*2){const protectedNew=Math.min(Math.max(1,minNewPerDay),maxNewPerDay,dailyQuestionLimit-reviews);return{reviews,newItems:protectedNew,backlog,minutes:reviews*reviewMinutes+protectedNew*newItemMinutes,mode:'clearing'};}
 const remaining=Math.max(0,budgetMinutes-reviews*reviewMinutes);
 const capacity=Math.floor(remaining/newItemMinutes);
 const newItems=capacity===0?0:Math.min(targetNew,maxNewPerDay,dailyQuestionLimit-reviews,Math.max(Math.min(minNewPerDay,capacity),capacity));
 return{reviews,newItems,backlog,minutes:reviews*reviewMinutes+newItems*newItemMinutes,mode:'normal'};
}
