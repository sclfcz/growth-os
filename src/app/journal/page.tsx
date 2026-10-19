import{JournalPage}from'@/components/module-pages';import{getLogicalDate}from'@/server/core/date';
export default function Page(){return <JournalPage aiEnabled={Boolean(process.env.AI_API_KEY&&process.env.AI_BASE_URL&&process.env.AI_MODEL)} date={getLogicalDate()}/>;}
