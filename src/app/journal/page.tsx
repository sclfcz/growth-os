import{JournalPage}from'@/components/module-pages';import{getCalendarDate}from'@/server/core/date';
export const dynamic='force-dynamic';
export default function Page(){return <JournalPage aiEnabled={Boolean(process.env.AI_API_KEY&&process.env.AI_BASE_URL&&process.env.AI_MODEL)} date={getCalendarDate()}/>;}
