import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
const router=createRouter({history:createWebHistory(import.meta.env.BASE_URL),routes:[
  {path:'/',name:'home',component:()=>import('./views/Home.vue')},
  {path:'/schools',name:'schools',component:()=>import('./views/SchoolBrowser.vue')},
  {path:'/schools/:id',name:'school',component:()=>import('./views/SchoolDetailPage.vue')},
  {path:'/compare',name:'compare',component:()=>import('./views/SchoolBrowser.vue')},
  {path:'/shortlist',name:'shortlist',component:()=>import('./views/ShortlistView.vue')},
  {path:'/calendar',name:'calendar',component:()=>import('./views/CalendarView.vue')},
  {path:'/source-reference',name:'source-reference',component:()=>import('./views/SourceReferenceView.vue')},
  {path:'/sources',name:'sources',component:()=>import('./views/InformationView.vue')},
  {path:'/about',name:'about',component:()=>import('./views/InformationView.vue')},
  {path:'/:pathMatch(.*)*',name:'not-found',component:()=>import('./views/NotFound.vue')}
],scrollBehavior:()=>({top:0})});
const titles:Record<string,string>={home:'首頁',schools:'尋找學校',school:'學校資料',compare:'學校比較',shortlist:'私人選校清單',calendar:'招生日曆','source-reference':'年度概覽原文',sources:'資料來源',about:'關於平台','not-found':'找不到頁面'};
router.afterEach(to=>{document.title=`${titles[String(to.name)]??'選校'}｜香港選校年鑑`;});
createApp(App).use(router).mount('#app');
