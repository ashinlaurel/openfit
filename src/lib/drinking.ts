import { shiftDay } from './habits'
export type Drink={id:string;date:string;name:string;ml:number;abv:number;note:string}
export type DrinkingDemo={version:1;trackingStart:string;entries:Drink[];dryDays:string[];goal:number}
export const alcoholUnits=(ml:number,abv:number)=>ml*abv/1000
export const alcoholGrams=(ml:number,abv:number)=>ml*abv/100*.789
export function weekStart(date:string){const day=new Date(date+'T12:00:00Z').getUTCDay();return shiftDay(date,-((day+6)%7))}
export const isAlcoholFree=(entries:Drink[],date:string,today:string)=>date<=today&&!entries.some(entry=>entry.date===date&&entry.abv>0)
export function completedDryStreak(entries:Drink[],trackingStart:string,today:string){let count=0;for(let date=shiftDay(today,-1);date>=trackingStart&&isAlcoholFree(entries,date,today);date=shiftDay(date,-1))count++;return count}
export const sumUnits=(entries:Drink[])=>entries.reduce((total,entry)=>total+alcoholUnits(entry.ml,entry.abv),0)
export function validDrink(entry:Drink,today:string){return /^\d{4}-\d{2}-\d{2}$/.test(entry.date)&&!Number.isNaN(Date.parse(entry.date+'T12:00:00Z'))&&new Date(entry.date+'T12:00:00Z').toISOString().slice(0,10)===entry.date&&entry.date<=today&&entry.date>='1900-01-01'&&entry.name.trim().length>0&&entry.name.length<=80&&Number.isFinite(entry.ml)&&entry.ml>=1&&entry.ml<=10000&&Number.isFinite(entry.abv)&&entry.abv>=0&&entry.abv<=100&&entry.note.length<=300}
export function seedDrinking(today:string):DrinkingDemo{
 const entries:Drink[]=[];const dryDays:string[]=[]
 for(let i=55;i>=0;i--){const date=shiftDay(today,-i),day=new Date(date+'T12:00:00Z').getUTCDay();if(i===0||i===3||i===19)continue
  if(day===5||day===6||i===9){entries.push({id:'demo-'+date,date,name:day===5?'Lager':'Red wine',ml:day===5?660:300,abv:day===5?5:13,note:day===5?'Dinner with friends':'Evening at home'});if(i>20&&day===6)entries.push({id:'demo-extra-'+date,date,name:'Whisky',ml:180,abv:40,note:''})}
  else dryDays.push(date)
 }
 return {version:1,trackingStart:shiftDay(today,-55),entries,dryDays,goal:8}
}
export function readDrinking(today:string):DrinkingDemo{try{const value=JSON.parse(localStorage.getItem('openfit:drinking-demo:v1')||'null');if(value?.version===1&&Array.isArray(value.entries)&&value.entries.every((e:Drink)=>validDrink(e,today))&&Array.isArray(value.dryDays)&&value.dryDays.every((d:unknown)=>typeof d==='string'&&validDrink({id:'',date:d,name:'date',ml:1,abv:0,note:''},today))&&typeof value.goal==='number'&&Number.isFinite(value.goal)&&value.goal>=0&&value.goal<=14)return {...value,trackingStart:[today,...value.entries.map((e:Drink)=>e.date),...value.dryDays,...(typeof value.trackingStart==='string'&&validDrink({id:'',date:value.trackingStart,name:'date',ml:1,abv:0,note:''},today)?[value.trackingStart]:[shiftDay(today,-55)])].sort()[0]}}catch{/* start a clearly labelled demo */}return seedDrinking(today)}
