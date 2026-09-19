import {createApp} from 'vue';import {createRouter,createWebHistory} from 'vue-router';import FullApp from './FullApp.vue';import './style.css';
const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:FullApp}],scrollBehavior:()=>({top:0})});createApp(FullApp).use(router).mount('#app');
