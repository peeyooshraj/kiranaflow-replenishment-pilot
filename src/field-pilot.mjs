import { selectForecast } from "./forecasting.mjs";
import { calculateInventoryPolicy, standardDeviation } from "./inventory-policy.mjs";

export const FIELD_REQUIRED_COLUMNS = Object.freeze(["date","sku","product","quantity_sold","closing_stock","unit","lead_time_days","pack_size"]);

export function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("CSV input must be text");
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i+=1){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i+=1;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell="";}else if(ch==='\n'){row.push(cell.replace(/\r$/, ""));rows.push(row);row=[];cell="";}else cell+=ch;}
  if(quoted) return Object.freeze({status:"INVALID_CSV",errors:Object.freeze(["Unclosed quoted field"]),rows:Object.freeze([])});
  if(cell!==""||row.length){row.push(cell.replace(/\r$/, ""));rows.push(row);}
  if(!rows.length) return Object.freeze({status:"INVALID_CSV",errors:Object.freeze(["File is empty"]),rows:Object.freeze([])});
  const headers=rows[0].map((x)=>x.trim().toLowerCase()); const missing=FIELD_REQUIRED_COLUMNS.filter((h)=>!headers.includes(h));
  if(missing.length) return Object.freeze({status:"INVALID_SCHEMA",errors:Object.freeze([`Missing columns: ${missing.join(", ")}`]),rows:Object.freeze([]),headers:Object.freeze(headers)});
  const objects=rows.slice(1).filter((r)=>r.some((x)=>x.trim()!=="")).map((r,index)=>Object.fromEntries(headers.map((h,i)=>[h,r[i]?.trim()??""]).concat([["__row",index+2]])));
  return Object.freeze({status:"PARSED",errors:Object.freeze([]),rows:Object.freeze(objects),headers:Object.freeze(headers)});
}

function numberField(raw, field, rowNumber, {positive=false,integer=false}={}) { const value=Number(raw); if(!Number.isFinite(value)||(positive?value<=0:value<0)||(integer&&!Number.isInteger(value))) return {error:`Row ${rowNumber}: ${field} is invalid`}; return {value}; }

export function reviewOperationalCsv(text) {
  const parsed=parseCsv(text); if(parsed.status!=="PARSED") return Object.freeze({...parsed,products:Object.freeze([]),validRows:0,invalidRows:0});
  const errors=[],valid=[];
  for(const r of parsed.rows){const rowErrors=[];if(!r.sku)rowErrors.push(`Row ${r.__row}: sku is blank`);if(!r.product)rowErrors.push(`Row ${r.__row}: product is blank`);if(!r.unit)rowErrors.push(`Row ${r.__row}: unit is blank`);if(!r.date||Number.isNaN(Date.parse(r.date)))rowErrors.push(`Row ${r.__row}: date is invalid`);
    const sold=numberField(r.quantity_sold,"quantity_sold",r.__row),stock=numberField(r.closing_stock,"closing_stock",r.__row),lead=numberField(r.lead_time_days,"lead_time_days",r.__row,{positive:true}),pack=numberField(r.pack_size,"pack_size",r.__row,{positive:true,integer:true});
    for(const x of [sold,stock,lead,pack])if(x.error)rowErrors.push(x.error); if(rowErrors.length){errors.push(...rowErrors);continue;} valid.push({...r,quantitySold:sold.value,closingStock:stock.value,leadTimeDays:lead.value,packSize:pack.value,dateIso:new Date(r.date).toISOString().slice(0,10)});}
  const bySku=new Map(); for(const r of valid){if(!bySku.has(r.sku))bySku.set(r.sku,[]);bySku.get(r.sku).push(r);}
  const products=[]; for(const [sku,rows] of bySku){rows.sort((a,b)=>a.dateIso.localeCompare(b.dateIso)||a.__row-b.__row);const daily=new Map();for(const r of rows)daily.set(r.dateIso,(daily.get(r.dateIso)??0)+r.quantitySold);const latest=rows.at(-1);products.push(Object.freeze({sku,name:latest.product,unit:latest.unit,supplier:latest.supplier||"",onHand:latest.closingStock,leadTimeDays:latest.leadTimeDays,packSize:latest.packSize,demandHistory:Object.freeze([...daily.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,q])=>q)),historyDays:daily.size,lastObservationDate:latest.dateIso}));}
  products.sort((a,b)=>a.name.localeCompare(b.name)); return Object.freeze({status:errors.length?"REVIEW_REQUIRED":"READY",errors:Object.freeze(errors),products:Object.freeze(products),validRows:valid.length,invalidRows:parsed.rows.length-valid.length,totalRows:parsed.rows.length});
}

export function productAdvice(product,{serviceFactor=1.28,reviewPeriodDays=5}={}) { const forecast=selectForecast([...product.demandHistory]); if(forecast.status!=="FORECAST_READY") return Object.freeze({status:"INSUFFICIENT_HISTORY",forecast,inventory:null}); const sd=standardDeviation([...product.demandHistory])??0,inventory=calculateInventoryPolicy({usableStock:product.onHand,reserved:0,incomingConfirmed:0,dailyForecast:forecast.forecast,demandStdDev:sd,leadTimeMeanDays:product.leadTimeDays,leadTimeStdDevDays:0,reviewPeriodDays,serviceFactor,packSize:product.packSize}); return Object.freeze({status:"READY",forecast,inventory,needsAttention:inventory.belowReorderPoint||inventory.rawRequirement>0}); }
