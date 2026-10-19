import{JournalPage}from'@/components/module-pages';
export default async function Page({params}:{params:Promise<{date:string}>}){const{date}=await params;return <JournalPage aiEnabled={Boolean(process.env.AI_API_KEY&&process.env.AI_BASE_URL&&process.env.AI_MODEL)} date={date}/>;}
