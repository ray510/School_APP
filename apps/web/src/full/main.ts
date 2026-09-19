import {createApp} from 'vue';
import {createRouter,createWebHistory} from 'vue-router';
import RootApp from './RootApp.vue';
import './style.css';
const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:RootApp}],scrollBehavior:()=>({top:0})});
createApp(RootApp).use(router).mount('#app');
