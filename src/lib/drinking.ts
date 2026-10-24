import { shiftDay } from './habits'
export type Drink={id:string;date:string;name:string;ml:number;abv:number;note:string}
export type DrinkingStore={version:1;trackingStart:string;entries:Drink[];dryDays:string[];goal:number}
export const DRINKING_STORAGE_KEY='openfit:drinking:v1'
export const emptyDrinking=(today:string):DrinkingStore=>({version:1,trackingStart:today,entries:[],dryDays:[],goal:8})
export const alcoholUnits=(ml:number,abv:number)=>ml*abv/1000
export const alcoholGrams=(ml:number,abv:number)=>ml*abv/100*.789
export function weekStart(date:string){const day=new Date(date+'T12:00:00Z').getUTCDay();return shiftDay(date,-((day+6)%7))}
export const isAlcoholFree=(entries:Drink[],date:string,today:string,trackingStart='1900-01-01')=>date>=trackingStart&&date<=today&&!entries.some(entry=>entry.date===date&&entry.abv>0)
export function completedDryStreak(entries:Drink[],trackingStart:string,today:string){let count=0;for(let date=shiftDay(today,-1);date>=trackingStart&&isAlcoholFree(entries,date,today);date=shiftDay(date,-1))count++;return count}
export const sumUnits=(entries:Drink[])=>entries.reduce((total,entry)=>total+alcoholUnits(entry.ml,entry.abv),0)
export function validDrink(entry:Drink,today:string){return Boolean(entry)&&typeof entry.id==='string'&&typeof entry.date==='string'&&typeof entry.name==='string'&&typeof entry.note==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(entry.date)&&!Number.isNaN(Date.parse(entry.date+'T12:00:00Z'))&&new Date(entry.date+'T12:00:00Z').toISOString().slice(0,10)===entry.date&&entry.date<=today&&entry.date>='1900-01-01'&&entry.name.trim().length>0&&entry.name.length<=80&&Number.isFinite(entry.ml)&&entry.ml>=1&&entry.ml<=10000&&Number.isFinite(entry.abv)&&entry.abv>=0&&entry.abv<=100&&entry.note.length<=300}
export function validateDrinking(value:DrinkingStore,today:string):DrinkingStore{
 if(value?.version!==1||!Array.isArray(value.entries)||value.entries.length>10000||!value.entries.every(e=>validDrink(e,today)&&e.id.length>0&&e.id.length<=100)||new Set(value.entries.map(e=>e.id)).size!==value.entries.length||!Array.isArray(value.dryDays)||value.dryDays.length>10000||!value.dryDays.every(date=>validDrink({id:'date',date,name:'date',ml:1,abv:0,note:''},today))||!validDrink({id:'date',date:value.trackingStart,name:'date',ml:1,abv:0,note:''},today)||value.entries.some(e=>e.date<value.trackingStart)||!Number.isInteger(value.goal)||value.goal<0||value.goal>14)throw new Error('Your drinking log could not be opened. The saved data has been preserved.')
 return value
}
export function readDrinking(today:string):DrinkingStore{const raw=localStorage.getItem(DRINKING_STORAGE_KEY);return raw?validateDrinking(JSON.parse(raw),today):emptyDrinking(today)}
