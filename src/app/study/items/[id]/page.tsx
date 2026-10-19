import{StudyItemPage}from'@/components/study-item-page';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <StudyItemPage itemId={Number(id)} aiEnabled={Boolean(process.env.AI_API_KEY&&process.env.AI_BASE_URL&&process.env.AI_MODEL)}/>;}
