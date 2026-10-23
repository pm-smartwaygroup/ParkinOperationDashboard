/* Authenticated directory reports. The APIs decide company scope; never infer or aggregate bookings. */
(() => {
  'use strict';
  if (window.ParkinDirectoryReportAPI) return;
  const ROUTES = Object.freeze({
    locations: {route:'locations',kind:'paged',key:'items'},
    customers: {route:'customers',kind:'paged',key:'customers'},
    companies: {route:'companies',kind:'paged',key:'items'},
    vehicles: {route:'vehicles',kind:'all',key:'items'},
    drivers: {route:'drivers',kind:'list',key:'data'},
    users: {route:'users',kind:'paged-user',key:'data'},
  });
  const LIMIT = 100;
  const MAX = 10000;
  const dayTime = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const text = input => input == null ? '' : String(input).trim();
  const stamped = createdAt => {
    const instant = new Date(createdAt);
    if (!createdAt || !Number.isFinite(instant.getTime())) throw new Error('Directory API returned a record without a valid creation timestamp.');
    const parts=Object.fromEntries(dayTime.formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
  };
  function normalize(kind, item) {
    if (!item || typeof item!=='object' || typeof item.id!=='string' || !item.id) throw new Error('Directory API returned an invalid record ID.');
    const base = {id:item.id,...stamped(item.createdAt)};
    if (kind==='locations') return {...base, location:text(item.name),code:text(item.code),city:text(item.city),district:text(item.district),company:text(item.company?.name||item.companyId),status:text(item.status),capacity:item.capacity??null};
    if (kind==='customers') return {...base,customer:text(item.fullName),phone:text(item.phoneE164||[item.phoneCountryCode,item.phoneNumber].filter(Boolean).join(' ')),company:text(item.operationalCompany?.name||item.company?.name||item.operationalCompanyId||item.companyId),source:text(item.createdSource),status:text(item.status),vehicles:item.vehicleCount??item._count?.vehicles??null};
    if (kind==='vehicles') return {...base,vehicle:[item.make,item.model].filter(Boolean).map(text).join(' '),plate:text(item.plateDisplayEnglish||[item.plateNumberEnglish,item.plateLettersEnglish].filter(Boolean).join(' ')),customer:text(item.customer?.fullName||item.customerId),company:text(item.company?.name||item.companyId),parkingType:text(item.parkingTypeLabel),status:text(item.status)};
    if (kind==='companies') return {...base,company:text(item.name),code:text(item.code),status:text(item.status),drivers:item.activeDrivers??null,locations:item.assignedLocations??null,customers:item.totalCustomers??null};
    if (kind==='drivers') {
      const assignment=Array.isArray(item.assignments)?(item.assignments.find(a=>a.isPrimary)||item.assignments[0]):null;
      return {...base,driver:text(item.fullName||[item.firstName,item.middleName,item.lastName].filter(Boolean).join(' ')),driverCode:text(item.driverCode),phone:text([item.phoneCountryCode,item.phoneNumber].filter(Boolean).join(' ')),company:text(item.companyName||item.employment?.company?.name||item.company?.name||item.companyId),location:text(item.locationName||assignment?.location?.name),driverType:text(item.driverType),status:text(item.status)};
    }
    if (kind==='users') return {...base,user:text(item.name),email:text(item.email),role:text(item.role),company:text(item.company?.name||item.companyId),accessScope:text(item.accessScope),enabled:item.isActive===true?'Yes':item.isActive===false?'No':'Not reported',suspension:item.suspensionEnabled===true?'Configured':item.suspensionEnabled===false?'Not configured':'Not reported'};
    throw new Error('Unsupported directory report category.');
  }
  async function get(url,token,signal) {
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal,cache:'no-store'});
    if(response.status===401)throw new Error('Session expired. Sign in again to view this report.');
    if(response.status===403)throw new Error('Access denied. This report requires the corresponding module permission and server authorization.');
    if(!response.ok)throw new Error(`Directory API request failed (HTTP ${response.status}).`);
    const body=await response.json().catch(()=>null);
    if(!body||typeof body!=='object'||body.success===false)throw new Error('Directory API returned an invalid response.');
    return Array.isArray(body.data)&&body.pagination?body:(body.data && typeof body.data==='object' ? body.data : body);
  }
  async function fetchAll({kind,apiBaseUrl,token,signal,onProgress}) {
    const spec=ROUTES[kind];
    if(!spec)throw new Error('Unsupported directory report category.');
    if(!token)throw new Error('Sign in to load the report.');
    if(!/^https?:\/\//.test(apiBaseUrl||''))throw new Error('ParkIn API URL is not configured.');
    const base=apiBaseUrl.replace(/\/$/,'');
    const items=[];const ids=new Set();let expectedTotal=null;let expectedPages=null;
    for(let page=1;page<=MAX/LIMIT;page++) {
      const query=(spec.kind==='paged'||spec.kind==='paged-user')?`?page=${page}&limit=${LIMIT}`:'';
      const payload=await get(`${base}/${spec.route}${query}`,token,signal);
      // Drivers already uses an unpaginated list in the existing Driver Management UI.
      // The endpoint supplies no total, so we report only the records returned, never a claimed global total.
      const list=spec.kind==='list';
      const received=list?(Array.isArray(payload)?payload:payload.drivers):payload[spec.key];
      if(!Array.isArray(received))throw new Error('Directory API omitted its records.');
      const paged=spec.kind==='paged'||spec.kind==='paged-user';
      const pagination=paged?(spec.kind==='paged-user'||kind==='customers'?payload.pagination:payload.meta):null;
      const total=list?received.length:paged?pagination?.total:payload.total;
      if(!Number.isSafeInteger(total)||total<0||total>MAX)throw new Error('Directory count invalid or exceeds 10,000 records; no partial report shown.');
      if(paged) {
        const pages=Math.max(1,Math.ceil(total/LIMIT));
        if(!pagination||pagination.page!==page||pagination.limit!==LIMIT||pagination.totalPages!== (total?pages:0))throw new Error('Directory pagination metadata is invalid.');
        if(expectedTotal!==null&&(expectedTotal!==total||expectedPages!==pages))throw new Error('Directory records changed during loading. Retry.');
        expectedPages=pages;
      }
      expectedTotal=total;
      for(const item of received) {
        const row=normalize(kind,item);
        if(ids.has(row.id))throw new Error('Directory API repeated a record ID; no partial report shown.');
        ids.add(row.id);items.push(row);
      }
      if(items.length>total)throw new Error('Directory API returned more records than the reported count.');
      onProgress?.(items.length,total);
      if(!paged||page>=expectedPages) {
        if(items.length!==total)throw new Error('Directory records are incomplete; no partial report shown.');
        return items;
      }
    }
    throw new Error('Directory report exceeded the page safety limit.');
  }
  window.ParkinDirectoryReportAPI=Object.freeze({fetchAll,normalize,MAX});
})();
