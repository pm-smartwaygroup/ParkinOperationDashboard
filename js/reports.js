/* ParkIn Reports — verified Bookings Report; unintegrated categories never render synthetic data. */
(() => {
  'use strict';
  if (window.ParkinReports) return;

  const CATEGORIES = [
    { id:'bookings', name:'Bookings Report', icon:'fa-calendar-days', description:'Booking details and statistics', singular:'Booking', filterLabel:'Booking Type', typeField:'type' },
    { id:'locations', name:'Locations Report', icon:'fa-location-dot', description:'Performance by location', singular:'Location', filterLabel:'Booking Type', typeField:'type' },
    { id:'drivers', name:'Drivers Report', icon:'fa-user-tie', description:'Driver activity and performance', singular:'Driver', filterLabel:'Booking Type', typeField:'type' },
    { id:'customers', name:'Customers Report', icon:'fa-users', description:'Customer insights and history', singular:'Customer', filterLabel:'Booking Type', typeField:'type' },
    { id:'vehicles', name:'Vehicles Report', icon:'fa-car', description:'Vehicle statistics and trends', singular:'Vehicle', filterLabel:'Booking Type', typeField:'type' },
    { id:'companies', name:'Companies Report', icon:'fa-building', description:'Company-wise performance', singular:'Company', filterLabel:'Booking Type', typeField:'type' },
    { id:'users', name:'Users Report', icon:'fa-user-gear', description:'System users and activity', singular:'User', filterLabel:'Role', typeField:'role' },
    { id:'revenue', name:'Revenue Report', icon:'fa-chart-column', description:'Payments and revenue analysis', singular:'Payment', filterLabel:'Payment Method', typeField:'method' },
  ];
  // Reports access is independent of module access. Both are required.
  // Read the same effective permissions as the existing Dashboard sidebar and routes.
  const REPORT_MODULE_PERMISSIONS = Object.freeze({
    bookings: 'bookings.view',
    locations: 'locations.view',
    drivers: 'drivers.view',
    customers: 'customers.view',
    vehicles: 'vehicles.view',
    companies: 'valet_companies.view',
    users: 'users.view',
    revenue: 'revenue.view',
  });
  function hasReportPermission(code) {
    return typeof window.hasDashboardPermission === 'function' &&
      window.hasDashboardPermission(code) === true;
  }
  function visibleCategories() {
    if (!hasReportPermission('reports.view')) return [];
    return CATEGORIES.filter(cat => hasReportPermission(REPORT_MODULE_PERMISSIONS[cat.id]));
  }
  function canOpenCategory(id) {
    return visibleCategories().some(cat => cat.id === id);
  }
  const COLORS = ['#00a75c','#2378ef','#862cff','#ff9016','#e83d50','#2ab8af'];
  // No synthetic report records are shipped to production.
  // Non-Bookings categories remain visible to permitted roles but are unavailable until integrated.
  const SOURCES = ['Customer App','Valet Driver App','Dashboard'];
  const PRINT_COLUMNS = [
    {key:'id',label:'Booking ID'}, {key:'date',label:'Booking Date'}, {key:'customer',label:'Customer'},
    {key:'vehicle',label:'Vehicle'}, {key:'type',label:'Vehicle Parking Type'}, {key:'location',label:'Location / Zone'},
    {key:'driver',label:'Driver'}, {key:'amount',label:'Amount'}, {key:'status',label:'Status'}, {key:'source',label:'Source'},
  ];
  const SCREEN_BOOKING_COLUMNS = [
    {key:'id',label:'Booking ID'}, {key:'date',label:'Date & Time'},
    {key:'shiftTime',label:'Shift / Time Stamp'}, {key:'customer',label:'Customer'},
    {key:'vehicle',label:'Vehicle'}, {key:'type',label:'Booking Type'},
    {key:'location',label:'Location / Zone'}, {key:'driver',label:'Driver'},
    {key:'amount',label:'Amount (SAR)'}, {key:'paymentMethod',label:'Payment Method'},
    {key:'paymentStatus',label:'Payment Status'}, {key:'source',label:'Source'},
    {key:'status',label:'Booking Status'},
  ];
  const COLUMN_MAP = {
    bookings:SCREEN_BOOKING_COLUMNS,
    revenue:[{key:'paymentId',label:'Payment ID'},{key:'id',label:'Booking ID'},{key:'date',label:'Date'},{key:'customer',label:'Customer'},{key:'company',label:'Company'},{key:'method',label:'Method'},{key:'amount',label:'Amount'},{key:'paymentStatus',label:'Payment Status'}],
    locations:[{key:'location',label:'Location'},{key:'company',label:'Company'},{key:'bookings',label:'Bookings'},{key:'completed',label:'Completed'},{key:'cancelled',label:'Cancelled'},{key:'amount',label:'Revenue'}],
    drivers:[{key:'driver',label:'Driver'},{key:'company',label:'Company'},{key:'location',label:'Primary Location'},{key:'bookings',label:'Bookings'},{key:'completed',label:'Completed'},{key:'amount',label:'Revenue Generated'}],
    customers:[{key:'customer',label:'Customer'},{key:'phone',label:'Mobile'},{key:'bookings',label:'Bookings'},{key:'completed',label:'Completed'},{key:'location',label:'Recent Location'},{key:'amount',label:'Total Spent'}],
    vehicles:[{key:'vehicle',label:'Vehicle'},{key:'plate',label:'Plate'},{key:'customer',label:'Customer'},{key:'bookings',label:'Bookings'},{key:'completed',label:'Completed'},{key:'location',label:'Recent Location'}],
    companies:[{key:'company',label:'Company'},{key:'bookings',label:'Bookings'},{key:'completed',label:'Completed'},{key:'drivers',label:'Active Drivers'},{key:'locations',label:'Locations'},{key:'amount',label:'Revenue'}],
    users:[{key:'userId',label:'User ID'},{key:'user',label:'User'},{key:'role',label:'Role'},{key:'company',label:'Company'},{key:'location',label:'Access Location'},{key:'date',label:'Last Activity'},{key:'status',label:'Status'}],
  };
  const PRESETS_KEY = 'parkin_reports_ui_saved_filters_v1';
  const formatCurrency = value => `SAR ${Number(value || 0).toLocaleString('en-US')}`;
  const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const pad = n => String(n).padStart(2,'0');
  const dateId = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  const localDate = iso => { const [y,m,d]=String(iso).split('-').map(Number); return new Date(y,m-1,d); };
  const shortDate = iso => localDate(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const today = () => new Date();
  const defaultFilters = () => {
    // Filter values are Saudi-local wall-clock times, matching the adapter's AST values.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23',hour:'2-digit',minute:'2-digit'
    }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    return {from:`${parts.year}-${parts.month}-01T00:00`,to:`${day}T23:59`,type:'',company:'',location:'',source:'',status:'',paymentMethod:'',groupBy:'daily'};
  };
  const state = {type:'bookings',filters:defaultFilters(),applied:defaultFilters(),search:'',sortKey:'date',sortDirection:-1,page:1,pageSize:8,selected:new Set(),hiddenColumns:new Set(),viewRecords:[],filteredBookings:[],root:null,firstModalFocus:null,liveRows:[],liveStatus:'idle',liveError:'',liveController:null,liveRequest:0,companyNames:new Map(),locationNames:new Map()};
  const qs = selector => state.root?.querySelector(selector);
  const qsa = selector => [...(state.root?.querySelectorAll(selector) || [])];
  const category = () => CATEGORIES.find(cat=>cat.id===state.type) || CATEGORIES[0];
  const optionList = (values,allLabel,selected='') => `<option value="">${html(allLabel)}</option>`+[...new Set(values)].sort().map(value=>`<option value="${html(value)}" ${value===selected?'selected':''}>${html(value)}</option>`).join('');
  // Only the Bookings report has a verified, permission-scoped API integration.
  function getReportRows(filtered) {
    return state.type === 'bookings' ? filtered.map(row=>({...row})) : [];
  }
  // Accept date-only legacy saved presets: start at 00:00, end at 23:59 AST.
  const filterClock = (value,end=false) => /^\d{4}-\d{2}-\d{2}$/.test(value||'')
    ? `${value}T${end?'23:59':'00:00'}` : String(value||'');
  const bookingClock = row => `${row.date}T${/^\d{2}:\d{2}$/.test(row.time||'')?row.time:'00:00'}`;
  function filteredBookings() {
    if (state.type !== 'bookings') return [];
    const f=state.applied;
    const from=filterClock(f.from),to=filterClock(f.to,true);
    return state.liveRows.filter(row=>bookingClock(row)>=from&&bookingClock(row)<=to
      &&(!f.company||row.companyId===f.company)&&(!f.location||row.locationId===f.location)
      &&(!f.source||row.source===f.source)&&(!f.status||row.status===f.status)
      &&(!f.type||row.type===f.type)&&(!f.paymentMethod||row.paymentMethod===f.paymentMethod));
  }
  function summary(rows, bookings) {
    const completed=bookings.filter(b=>b.status==='Completed'),cancelled=bookings.filter(b=>b.status==='Cancelled'),upcoming=bookings.filter(b=>state.type==='bookings'?b.statusGroup==='Open':b.status==='Upcoming');
    const revenue=completed.reduce((sum,b)=>sum+b.amount,0);
    const unique = key=>new Set(bookings.map(item=>item[key])).size;
    const base = {bookings:bookings.length,completed:completed.length,upcoming:upcoming.length,cancelled:cancelled.length,revenue,locations:unique('location'),drivers:unique('driver'),customers:unique('customer'),vehicles:unique('plate'),companies:unique('company')};
    const items = {
      bookings:[['Total Bookings',base.bookings,'fa-calendar-days','All matching booking records'],['Completed',base.completed,'fa-circle-check','Successfully completed'],['Open',base.upcoming,'fa-clock','Confirmed / in progress'],['Cancelled',base.cancelled,'fa-circle-xmark','Expired bookings excluded'],['Completed Booking Value',formatCurrency(revenue),'fa-coins','Booked amount, not verified payments']],
    };
    return items.bookings;
  }
  function renderTabs() {
    qs('[data-report-tabs]').innerHTML=visibleCategories().map(cat=>`<button type="button" role="tab" aria-selected="${cat.id===state.type}" data-report-type="${cat.id}" class="pr-report-tab"${cat.id!=='bookings'?' data-integration-pending="true"':''}><span class="pr-tab-icon"><i class="fa-solid ${cat.icon}" aria-hidden="true"></i></span><span class="pr-tab-name">${html(cat.name)}</span><span class="pr-tab-desc">${html(cat.id==='bookings'?cat.description:'Integration pending · No live data')}</span></button>`).join('');
  }
  function populateFilters() {
    if(state.type!=='bookings'){
      qs('#pr-pending-title').textContent=`${category().name} is not available yet`;
      qs('[data-report-data-tag]').textContent='Integration pending · No report data';
      qs('[data-report-data-tag]').classList.remove('pr-live-tag');
      qs('[data-live-refresh]').hidden=true;
      qs('[data-export-toggle]').disabled=true;
      return;
    }
    const defaults=defaultFilters();
    const f=state.filters;
    qs('[data-filter="from"]').value=filterClock(f.from||defaults.from);
    qs('[data-filter="to"]').value=filterClock(f.to||defaults.to,true);
    qs('[data-filter="groupBy"]').value=['daily','weekly','monthly'].includes(f.groupBy)?f.groupBy:'daily';
    const live=state.type==='bookings';
    const parkingTypes=live?[...new Set(state.liveRows.map(row=>row.type).filter(type=>type&&type!=='Not recorded'))]:[];
    qs('[data-filter="type"]').disabled=live&&!parkingTypes.length;
    qs('[data-filter="type"]').innerHTML=live
      ?parkingTypes.length?optionList(parkingTypes,'All parking types',f.type):'<option value="">Unavailable in booking API / no records</option>'
      :'<option value="">No booking classifications available</option>';
    if(live) {
      // Directory options include authorized companies/locations with zero bookings.
      // Booking rows remain the fallback when directory-view permission is absent.
      const companyNames=new Map(state.companyNames);
      const locations=new Map(state.locationNames);
      for(const row of state.liveRows) {
        if(row.companyId&&!companyNames.has(row.companyId))companyNames.set(row.companyId,`Company ID: ${row.companyId.slice(0,8)}…`);
        if(row.locationId&&!locations.has(row.locationId))locations.set(row.locationId,row.location);
      }
      const sortByLabel=([,a],[,b])=>String(a).localeCompare(String(b));
      const companyOptions=[...companyNames].sort(sortByLabel)
        .map(([id,name])=>`<option value="${html(id)}" ${f.company===id?'selected':''}>${html(name)}</option>`).join('');
      qs('[data-filter="company"]').innerHTML='<option value="">All companies</option>'+companyOptions;
      qs('[data-filter="location"]').innerHTML='<option value="">All locations</option>'+[...locations].sort(sortByLabel)
        .map(([id,name])=>`<option value="${html(id)}" ${f.location===id?'selected':''}>${html(name)}</option>`).join('');
      const methods=[...new Set(state.liveRows.map(row=>row.paymentMethod).filter(v=>v&&v!=='Not recorded'))];
      qs('[data-filter="paymentMethod"]').disabled=!methods.length;
      qs('[data-filter="paymentMethod"]').innerHTML=optionList(methods,methods.length?'All recorded methods':'No recorded methods',f.paymentMethod);
      qs('[data-filter="source"]').innerHTML=optionList(
        [...new Set([...SOURCES,...state.liveRows.map(row=>row.source)])], 'All sources',f.source);
      qs('[data-filter="status"]').innerHTML=optionList(
        ['Confirmed','Vehicle Parked','Return Requested','Retrieval In Progress','Ready for Handover','Completed','Cancelled','Expired'],
        'All statuses',f.status);
    }
    qs('[data-type-label]').textContent=live?'Vehicle Parking Type':category().filterLabel;
    qs('[data-source-label]').textContent=state.type==='users'?'Activity Source':'Source';
    qs('#pr-filters-title').textContent=`${category().name} Filters`;
    qs('#pr-details-title').textContent=state.type==='bookings'?'Booking Details':`${category().singular} Details`;
    qs('[data-details-subtitle]').textContent='Actual bookings from ParkIn · dates use Saudi Arabia time';
    qs('[data-overview-description]').textContent='Actual booking records in your permitted company/location scope. Completed value is not confirmed payment revenue.';
    qs('[data-live-refresh]').hidden=!live;
    const tag=qs('[data-report-data-tag]');
    tag.textContent=state.liveStatus==='ready'?`Live · ${state.liveRows.length.toLocaleString('en-US')} authorized bookings`:state.liveStatus==='error'?'Live data unavailable':state.liveStatus==='loading'?'Loading real bookings…':'Live booking data';
    tag.classList.toggle('pr-live-tag',live);
    qs('[data-export-toggle]').disabled=state.liveStatus!=='ready';
  }
  function readFilters() {
    return Object.fromEntries(['from','to','type','company','location','source','status','paymentMethod','groupBy'].map(k=>[k,qs(`[data-filter="${k}"]`).value]));
  }
  function showFeedback(message,success=false) {
    const item=qs('[data-feedback]'); if(!item)return;
    item.textContent=message||'';item.style.color=success?'#077945':'#b91c1c';
  }
  function applyFilters(next) {
    const from=filterClock(next.from),to=filterClock(next.to,true);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(to)||next.from>next.to||from>to){
      showFeedback('Choose a valid date range: From must be on or before To, including time (AST).');return false;
    }
    state.filters={...next,from,to};state.applied={...state.filters};state.page=1;state.selected.clear();showFeedback('');renderAll();return true;
  }
  function displayRows() {
    const filtered=filteredBookings();state.filteredBookings=filtered;
    const raw=getReportRows(filtered);
    const term=state.search.trim().toLowerCase();
    const cols=COLUMN_MAP[state.type];
    const searched=term?raw.filter(row=>cols.some(col=>String(row[col.key]??'').toLowerCase().includes(term))):raw;
    return searched.sort((a,b)=>{
      const key=state.sortKey;const x=key==='date'?bookingClock(a):a[key]??'',y=key==='date'?bookingClock(b):b[key]??'';
      const comparison=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
      return state.sortDirection*comparison;
    });
  }
  function renderKpis(rows,filtered) {
    if(state.liveStatus!=='ready'){qs('[data-kpis]').innerHTML=`<div class="pr-live-placeholder">${html(state.liveStatus==='error'?'Actual booking records could not be loaded.': 'Loading verified booking metrics…')}</div>`;return;}
    qs('[data-kpis]').innerHTML=summary(rows,filtered).map(([label,value,icon,note])=>`<article class="pr-panel pr-metric"><span class="pr-metric-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></span><div><div class="pr-metric-label">${html(label)}</div><div class="pr-metric-value">${html(value)}</div><div class="pr-metric-note">${html(note)}</div></div></article>`).join('');
  }
  function chartItems(filtered,rows) {
    return filtered;
  }
  function renderCharts(filtered,rows) {
    if(state.type==='bookings'&&state.liveStatus!=='ready'){qs('[data-trend-chart]').textContent=state.liveStatus==='error'?'Booking charts unavailable.':'Loading…';qs('[data-trend-total]').textContent='';qs('[data-donut-total]').textContent='—';qs('[data-breakdown-key]').textContent='';qs('[data-top-locations]').textContent='';return;}
    const live=state.type==='bookings';
    const series=chartItems(filtered,rows);
    const grouping=state.applied.groupBy||'daily';
    const timeBucket=date=>{
      if(grouping==='monthly')return `${date.slice(0,7)}-01`;
      if(grouping==='weekly'){
        const d=new Date(`${date}T00:00:00Z`);
        const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);
        return d.toISOString().slice(0,10);
      }
      return date;
    };
    const dayCounts=new Map();
    for(const item of series){const bucket=timeBucket(item.date);const day=dayCounts.get(bucket)||{ok:0,up:0,no:0,expired:0};const status=live?item.statusGroup:(item.status||'');if(['Completed','Active'].includes(status))day.ok++;else if(['Open','Upcoming','Pending'].includes(status))day.up++;else if(status==='Expired')day.expired++;else day.no++;dayCounts.set(bucket,day);}
    const ordered=[...dayCounts.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const days=ordered.slice(-16);const max=Math.max(1,...days.map(([,counts])=>counts.ok+counts.up+counts.no+counts.expired));
    qs('[data-trend-total]').textContent=`${series.length} records · ${grouping}`;
    qs('[data-trend-chart]').innerHTML=days.length?days.map(([date,count],i)=>{
      const total=count.ok+count.up+count.no+count.expired;const height=total?Math.max(3,total/max*100):0;
      return `<div class="pr-chart-col" title="${html(shortDate(date))}: ${total} records"><div class="pr-stack" style="height:${height}%"><span style="height:${count.ok/total*100}%;background:${COLORS[0]}"></span><span style="height:${count.up/total*100}%;background:${COLORS[1]}"></span><span style="height:${count.no/total*100}%;background:${COLORS[4]}"></span>${live?`<span style="height:${count.expired/total*100}%;background:${COLORS[3]}"></span>`:''}</div><span class="pr-chart-x">${i===0||i===days.length-1||i%3===0?html(shortDate(date).slice(0,6)):''}</span></div>`;
    }).join(''):'<p class="pr-empty">No chart data for these filters.</p>';
    const statusNames=state.type==='users'?['Active','Disabled','Suspended']:live?['Completed','Open','Cancelled','Expired']:['Completed','Upcoming','Cancelled'];
    const statusColors=live?[COLORS[0],COLORS[1],COLORS[4],COLORS[3]]:[COLORS[0],COLORS[1],COLORS[4]];
    qs('[data-trend-legend]').innerHTML=statusNames.map((name,i)=>`<span><i class="pr-dot" style="background:${statusColors[i]}"></i>${html(name)}</span>`).join('');
    let key=live?'source':'type';let title=live?'Bookings by Source':'Bookings by Type';
    if(state.type==='revenue'){key='method';title='By Payment Method';}
    if(state.type==='users'){key='role';title='Users by Role';}
    if(state.type==='companies'){key='company';title='By Company';}
    if(state.type==='drivers'){key='driver';title='By Driver';}
    if(state.type==='locations'){key='location';title='By Location';}
    if(state.type==='customers'){key='customer';title='By Customer';}
    if(state.type==='vehicles'){key='vehicle';title='By Vehicle';}
    qs('#pr-breakdown-title').innerHTML=`<i class="fa-solid fa-chart-pie" aria-hidden="true"></i> ${html(title)}`;
    const groups=new Map();for(const item of series)groups.set(item[key]||'Other',(groups.get(item[key]||'Other')||0)+1);
    const sorted=[...groups.entries()].sort((a,b)=>b[1]-a[1]);
    const display=sorted.length>5?[...sorted.slice(0,4),['Other',sorted.slice(4).reduce((s,x)=>s+x[1],0)]]:sorted;
    let angle=0;const background=display.map(([,count],i)=>{const start=angle;angle+=series.length?count/series.length*100:0;return `${COLORS[i%COLORS.length]} ${start}% ${angle}%`;}).join(', ');
    qs('[data-donut]').style.background=background?`conic-gradient(${background})`:'#e8eef3';
    qs('[data-donut]').setAttribute('aria-label',`${series.length} records distributed by ${title.toLowerCase()}`);
    qs('[data-donut-total]').textContent=series.length;
    qs('[data-breakdown-key]').innerHTML=display.length?display.map(([name,count],i)=>`<div class="pr-key-line"><span class="pr-key-label" title="${html(name)}"><i class="pr-dot" style="background:${COLORS[i%COLORS.length]}"></i>${html(name)}</span><span class="pr-key-value">${count} <small>(${Math.round(count/series.length*100)}%)</small></span></div>`).join(''):'<p class="pr-empty">No matching records.</p>';
    const locationTotals=new Map();for(const row of series)locationTotals.set(row.location,(locationTotals.get(row.location)||0)+1);
    const locations=[...locationTotals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);const largest=locations[0]?.[1]||1;
    qs('[data-top-locations]').innerHTML=locations.length?locations.map(([name,count],i)=>`<div class="pr-rank-row" title="${html(name)}: ${count}"><span class="pr-rank-number">${i+1}</span><span class="pr-rank-name">${html(name)}</span><span class="pr-rank-track"><span class="pr-rank-fill" style="display:block;width:${Math.max(2,count/largest*100)}%"></span></span><span class="pr-rank-value">${count}</span></div>`).join(''):'<p class="pr-empty">No matching locations.</p>';
  }
  function isStatus(key) {return key==='status'||key==='paymentStatus';}
  function cellValue(row,key){
    if(key==='amount')return row[key]===null||row[key]===undefined?'—':formatCurrency(row[key]);
    if(key==='shiftTime')return row.time?`${row.time} AST`:'Not recorded';
    if(key==='paymentStatus')return 'Not available'; // No settlement/verification status in Booking API.
    return row[key]??'—';
  }
  // An empty *authorized, successfully fetched* booking report is not an API error.
  // Keep loading / access failures visible, and never show this illustration for pending tabs.
  function updateBookingEmptyState(rows) {
    const empty = state.type === 'bookings' && state.liveStatus === 'ready' && rows.length === 0;
    const hasOtherBookings = empty && state.liveRows.length > 0;
    const emptyBox = qs('[data-bookings-empty]');
    if (!emptyBox) return;
    emptyBox.hidden = !empty;
    for (const selector of ['.pr-overview-header', '[data-kpis]', '.pr-chart-grid', '.pr-table-toolbar', '.pr-table-scroll', '.pr-table-footer']) {
      const section = qs(selector);
      if (section) section.hidden = empty;
    }
    if (!empty) return;
    qs('[data-empty-title]').textContent = 'No bookings found';
    qs('[data-empty-description]').textContent = hasOtherBookings
      ? 'No bookings match your selected filters or search. View all available bookings or adjust the filters above.'
      : 'No booking records are available within your account’s permitted company and location scope.';
    qs('[data-empty-clear-filters]').hidden = !hasOtherBookings;
    // Booking creation is customer-scoped in ParkIn: select a customer first.
    // Never advertise a dead route or an action beyond the user's permissions.
    const canCreate = hasReportPermission('bookings.create') && hasReportPermission('customers.view');
    qs('[data-empty-add-booking]').hidden = !canCreate;
    qs('[data-empty-hint]').hidden = !canCreate;
    closeMenus();
  }
  function viewAllAuthorizedBookings() {
    if (state.type !== 'bookings' || state.liveStatus !== 'ready' || !state.liveRows.length) return;
    const dates = state.liveRows.map(row => row.date).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    const next = {...defaultFilters(), from: dates[0]?`${dates[0]}T00:00`:defaultFilters().from, to: dates.length?`${dates[dates.length - 1]}T23:59`:defaultFilters().to};
    state.search = '';
    qs('[data-search]').value = '';
    state.filters = next;
    populateFilters();
    if (applyFilters(next)) showFeedback('Showing all booking records available to your account.', true);
  }
  function bookingTableCell(row,col) {
    const key=col.key,value=cellValue(row,key);
    if(key==='shiftTime')return `<span class="pr-time-pill" title="Shift assignments are not available in the booking API"><span>Shift not recorded</span><strong>${html(value)}</strong></span>`;
    if(key==='paymentStatus')return '<span class="pr-unrecorded" title="Payment verification is not returned by the Bookings API">Not available</span>';
    if(key==='type'||key==='source'){
      const color=key==='type'?(row.type==='Valet Parking'?'pr-chip-green':'pr-chip-blue')
        :(row.source==='Valet Driver App'?'pr-chip-purple':'pr-chip-blue');
      return `<span class="pr-value-chip ${color}">${html(value)}</span>`;
    }
    if(key==='status')return `<span class="pr-status pr-status--${String(value).toLowerCase().replace(/[^a-z]/g,'')}"><span class="pr-status-dot" aria-hidden="true"></span>${html(value)}</span>`;
    if(key==='paymentMethod')return row.paymentMethod&&row.paymentMethod!=='Not recorded'
      ?`<span class="pr-payment-method"><i class="fa-regular fa-credit-card" aria-hidden="true"></i> ${html(value)}</span>`
      :'<span class="pr-unrecorded">Not recorded</span>';
    const main=html(value);
    const secondary=key==='customer'?row.phone:key==='vehicle'?row.plate:key==='date'&&row.time?`${row.time} AST`:null;
    return `${main}${secondary?`<small>${html(secondary)}</small>`:''}`;
  }
  function renderPageNumbers(maxPage){
    const first=Math.max(1,Math.min(state.page-2,maxPage-4));
    const last=Math.min(maxPage,first+4);
    const buttons=[];
    for(let i=first;i<=last;i++)buttons.push(`<button type="button" class="pr-page-button${i===state.page?' is-current':''}" data-go-page="${i}" ${i===state.page?'aria-current="page"':''} aria-label="Go to page ${i}">${i}</button>`);
    qs('[data-page-numbers]').innerHTML=buttons.join('');
    qs('[data-page-size]').value=String(state.pageSize);
  }
  function renderTable(rows) {
    updateBookingEmptyState(rows);
    if(state.type==='bookings'&&state.liveStatus!=='ready'){qs('[data-table-head]').innerHTML='';qs('[data-table-body]').innerHTML=`<tr><td class="pr-no-results">${html(state.liveStatus==='error'?state.liveError:'Loading real booking records from the API…')}</td></tr>`;qs('[data-table-info]').textContent=state.liveStatus==='error'?'No report generated': 'Loading…';qs('[data-page-info]').textContent='';qs('[data-page-prev]').disabled=true;qs('[data-page-next]').disabled=true;return;}
    const cols=COLUMN_MAP[state.type].filter(col=>!state.hiddenColumns.has(col.key));
    const start=(state.page-1)*state.pageSize;
    const pageRows=rows.slice(start,start+state.pageSize);
    qs('[data-table-head]').innerHTML=`<tr><th><input type="checkbox" class="pr-checkbox" data-select-page aria-label="Select visible records"></th>${cols.map(col=>`<th scope="col"><button type="button" data-sort="${html(col.key)}" title="Sort by ${html(col.label)}">${html(col.label)} ${state.sortKey===col.key?(state.sortDirection===1?'↑':'↓'):'↕'}</button></th>`).join('')}<th>Actions</th></tr>`;
    qs('[data-table-body]').innerHTML=pageRows.length?pageRows.map((row,i)=>{
      const id=recordId(row);
      return `<tr><td><input class="pr-checkbox" type="checkbox" data-select-record="${html(id)}" aria-label="Select ${html(id)}" ${state.selected.has(id)?'checked':''}></td>${cols.map(col=>{
        return `<td>${bookingTableCell(row,col)}</td>`;
      }).join('')}<td><button class="pr-row-action" type="button" data-show-record="${html(id)}"><i class="fa-regular fa-eye" aria-hidden="true"></i> View</button></td></tr>`;
    }).join(''):`<tr><td class="pr-no-results" colspan="${cols.length+2}">No records match the current filters. Try clearing search or adjusting the date range.</td></tr>`;
    const end=Math.min(start+state.pageSize,rows.length);const maxPage=Math.max(1,Math.ceil(rows.length/state.pageSize));
    qs('[data-table-info]').textContent=`Showing ${rows.length?start+1:0}–${end} of ${rows.length} actual records${state.selected.size?` · ${state.selected.size} selected`:''}`;
    qs('[data-page-info]').textContent=`of ${maxPage} pages`;
    renderPageNumbers(maxPage);
    qs('[data-page-prev]').disabled=state.page<=1;
    qs('[data-page-next]').disabled=state.page>=maxPage;
    const selectPage=qs('[data-select-page]');selectPage.checked=pageRows.length>0&&pageRows.every(row=>state.selected.has(recordId(row)));
    selectPage.indeterminate=pageRows.some(row=>state.selected.has(recordId(row)))&&!selectPage.checked;
  }
  function recordId(row){return String(row.id||row.userId||row.paymentId||row.plate||row.company||row.driver||row.customer||row.location||'unknown');}
  function renderColumnMenu(){qs('[data-column-options]').innerHTML=COLUMN_MAP[state.type].map(col=>`<label class="pr-column-option"><input type="checkbox" data-column="${html(col.key)}" ${state.hiddenColumns.has(col.key)?'':'checked'}> ${html(col.label)}</label>`).join('');}
  function renderAll(){
    // A visible report tab is not a promise that its API integration is complete.
    // Never render invented financial, customer, driver, or user metrics.
    const pending = state.type !== 'bookings';
    qs('[data-report-pending]').hidden=!pending;
    for(const selector of ['.pr-filters','.pr-overview-header','[data-kpis]','.pr-chart-grid','.pr-table-panel']){
      const section=qs(selector);
      if(section)section.hidden=pending;
    }
    renderTabs();
    if(pending){
      state.viewRecords=[];state.filteredBookings=[];state.selected.clear();
      // Do not leave previously permitted booking names or phone numbers in hidden DOM.
      for(const selector of ['[data-table-head]','[data-table-body]','[data-kpis]','[data-trend-chart]','[data-breakdown-key]','[data-top-locations]']){
        const element=qs(selector);
        if(element)element.textContent='';
      }
      return;
    }
    const rows=displayRows();state.viewRecords=rows;
    renderKpis(getReportRows(state.filteredBookings),state.filteredBookings);
    renderCharts(state.filteredBookings,getReportRows(state.filteredBookings));renderTable(rows);renderColumnMenu();
  }
  function switchCategory(id){
    // Never allow access to an undisplayed report via a synthetic click or stale tab.
    if(!canOpenCategory(id)||state.type===id)return;
    if(state.type==='bookings'){state.liveController?.abort();state.liveRequest++;if(state.liveStatus==='loading')state.liveStatus='idle';}
    state.type=id;state.filters.type='';state.filters.status='';state.filters.source='';state.filters.company='';state.filters.location='';state.filters.paymentMethod='';state.applied={...state.filters};state.sortKey=id==='users'?'date':id==='bookings'||id==='revenue'?'date':'bookings';state.sortDirection=-1;state.selected.clear();state.hiddenColumns.clear();state.search='';state.page=1;
    qs('[data-search]').value='';populateFilters();renderAll();closeMenus();
    if(id==='bookings')loadLiveBookings();
  }
  function closeMenus(exception){
    for(const [button,menu] of [['[data-saved-toggle]','[data-saved-menu]'],['[data-export-toggle]','[data-export-menu]'],['[data-column-toggle]','[data-column-menu]']]){
      if(exception===menu)continue;
      qs(menu).hidden=true;qs(button).setAttribute('aria-expanded','false');
    }
  }
  function toggleMenu(button,menu){const open=qs(menu).hidden;closeMenus();qs(menu).hidden=!open;qs(button).setAttribute('aria-expanded',String(open));}
  function readPresets(){try{const parsed=JSON.parse(localStorage.getItem(PRESETS_KEY)||'[]');return Array.isArray(parsed)?parsed.filter(x=>x&&x.type&&x.filters&&typeof x.name==='string').slice(0,20):[];}catch{return [];}}
  function savePresets(presets){try{localStorage.setItem(PRESETS_KEY,JSON.stringify(presets));return true;}catch{showFeedback('Browser storage is unavailable; this preset could not be saved.');return false;}}
  function renderPresets(){
    const items=readPresets().filter(item=>item.type===state.type);
    qs('[data-saved-list]').innerHTML=items.length?items.map(item=>`<div class="pr-preset-row"><button class="pr-menu-action" data-use-preset="${html(item.name)}" type="button"><i class="fa-regular fa-bookmark" aria-hidden="true"></i> ${html(item.name)}</button><button type="button" class="pr-preset-delete" data-delete-preset="${html(item.name)}" aria-label="Delete ${html(item.name)}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div>`).join(''):'<p class="pr-empty">No saved filters for this report.</p>';
  }
  function handlePresetAction(button){
    if(button.matches('[data-save-preset]')){
      const entered=window.prompt('Name this filter preset (saved only in this browser):');
      if(entered===null)return;
      const name=entered.trim().slice(0,40);
      if(!name){showFeedback('Enter a name for the filter preset.');return;}
      const preset={name,type:state.type,filters:readFilters()};
      const others=readPresets().filter(item=>!(item.type===preset.type&&item.name===name));
      if(savePresets([...others,preset].slice(-20))){renderPresets();showFeedback(`Saved preset “${name}” in this browser.`,true);}
      return;
    }
    if(button.matches('[data-use-preset]')){
      const item=readPresets().find(x=>x.type===state.type&&x.name===button.dataset.usePreset);
      if(item){state.filters={...defaultFilters(),...item.filters};populateFilters();if(applyFilters(readFilters())){closeMenus();showFeedback(`Applied preset “${item.name}”.`,true);}}
    }
    if(button.matches('[data-delete-preset]')){
      const name=button.dataset.deletePreset;
      if(savePresets(readPresets().filter(x=>!(x.type===state.type&&x.name===name)))){renderPresets();showFeedback('Saved filter deleted.',true);}
    }
  }
  function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s=`'${s}`;return `"${s.replace(/"/g,'""')}"`;}
  // The PDF export is deliberately isolated from the Dashboard's print stylesheet.
  // Checked rows take precedence; otherwise export ALL matching records, not one page.
  function rowsForExport() {
    if(state.type!=='bookings'||state.liveStatus!=='ready')return [];
    return state.selected.size
      ? state.viewRecords.filter(row => state.selected.has(recordId(row)))
      : state.viewRecords;
  }
  function printableCell(row,key) {
    const main = key === 'date' && row.date ? shortDate(row.date) : cellValue(row,key);
    const extra = key === 'customer' ? row.phone
      : key === 'vehicle' ? row.plate
      : key === 'date' && state.type === 'bookings' && row.time ? `${row.time} AST`
      : null;
    return `<span>${html(main)}</span>${extra ? `<small>${html(extra)}</small>` : ''}`;
  }
  function buildPrintDocument(rows,cols) {
    const isBookings = state.type === 'bookings';
    const title = isBookings ? 'Booking Records' : category().name;
    // Show a clear Saudi-local date range without changing any underlying filters.
    const formatPrintDate = value => {
      const match=String(value||'').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/);
      if(!match)return value||'Not specified';
      const day=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
        .format(new Date(`${match[1]}T12:00:00Z`));
      return match[2]?`${day}, ${match[2]} AST`:day;
    };
    const dateRange = `${formatPrintDate(state.applied.from)} — ${formatPrintDate(state.applied.to)}`;
    const choice = state.selected.size ? 'Selected records' : 'All matching records';
    const company = state.applied.company
      ? (state.companyNames.get(state.applied.company) || state.applied.company) : 'All companies';
    const location = state.applied.location
      ? (state.locationNames.get(state.applied.location) || state.applied.location) : 'All locations';
    const filters = [company,location,state.applied.source || 'All sources',state.applied.status || 'All statuses'];
    const headers = cols.map(col => `<th scope="col">${html(col.label)}</th>`).join('');
    const bodyRows = rows.map((row,index) => `<tr>${cols.map(col =>
      `<td${col.key === 'amount' ? ' class="amount"' : ''}>${printableCell(row,col.key)}</td>`
    ).join('')}</tr>`).join('');
    const generated = new Intl.DateTimeFormat('en-GB', {
      timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'
    }).format(today());
    // Embedded exact ParkIn wordmark: remains visible in browser PDF export without
    // network requests, extra files, or depending on print background graphics.
    const reportLogo = 'data:image/png;base64,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';
    if (isBookings) return buildBookingRecordsPrintDocument(rows,cols,reportLogo,{generated,dateRange,choice,company,location});
    // No scripts, scripts from outside, or external styles: only escaped authorized data.
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>ParkIn_${isBookings?'Bookings':'Reports'}_${rows.length}_records</title>
      <style>
        @page { size:A4 landscape; margin:11mm 10mm 14mm; }
        * { box-sizing:border-box; }
        html,body { margin:0; padding:0; color:#1b2b36; background:#fff; }
        body { font:9.5px/1.45 Arial,Tahoma,'Noto Sans Arabic',sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .pdf-head { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:0 0 13px; border-bottom:1px solid #d6e8df; margin-bottom:12px; }
        .head-left { display:flex; align-items:center; gap:14px; min-width:0; }
        .brand-logo { display:block; width:145px; height:auto; max-height:56px; object-fit:contain; object-position:left center; flex:none; }
        .brand-divider { height:44px; border-left:2px solid #0ca76b; flex:none; }
        .report-headline { min-width:0; }
        .eyebrow { display:block; font-size:8px; font-weight:700; color:#078951; letter-spacing:1.2px; margin-bottom:2px; }
        h1 { font-size:19px; line-height:1.1; letter-spacing:-0.4px; margin:0 0 4px; color:#102d29; }
        .subtitle { margin:0; color:#627780; font-size:9px; }
        .generated { text-align:right; flex:none; }
        .generated .document-label { display:inline-block; font-size:8px; font-weight:800; letter-spacing:0.8px; border:1px solid #cce8da; color:#087c51; border-radius:4px; padding:4px 8px; margin-bottom:6px; }
        .generated strong { display:block; font-size:9px; color:#243943; font-weight:700; }
        .generated small { display:block; color:#71858d; font-size:8px; margin-top:2px; }
        .summary { display:grid; grid-template-columns: 0.6fr 1fr 1.7fr; border:1px solid #d4e7df; border-left:4px solid #009d62; border-radius:7px; overflow:hidden; margin-bottom:8px; background:#f4faf7; }
        .summary-item { min-width:0; padding:10px 13px; border-right:1px solid #d4e7df; }
        .summary-item:last-child { border-right:0; }
        .summary-item .summary-label { display:block; color:#5e8072; font-size:8px; font-weight:800; letter-spacing:0.85px; margin-bottom:3px; }
        .summary-item strong { display:block; font-size:13px; line-height:1.25; color:#113d2e; overflow-wrap:anywhere; }
        .summary-item:first-child strong { font-size:20px; }
        .scope { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px 12px; padding:8px 10px; border:1px solid #e1e9ea; border-radius:6px; margin-bottom:14px; font-size:8.6px; }
        .scope span { min-width:0; overflow-wrap:anywhere; }
        .scope b { display:block; margin-bottom:2px; font-size:7.8px; color:#648078; text-transform:uppercase; letter-spacing:0.4px; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:8.5px; }
        thead { display:table-header-group; }
        th { padding:8px 5px; text-align:left; background:#e6f3eb; color:#153d2d; border-bottom:1px solid #9bcfb3; font-size:8px; }
        td { padding:7px 5px; border-bottom:1px solid #dbe3e7; vertical-align:top; overflow-wrap:anywhere; word-wrap:break-word; }
        td small { display:block; color:#6b7e89; font-size:7.5px; margin-top:2px; }
        tr { break-inside:avoid; page-break-inside:avoid; }
        tbody tr:nth-child(even) { background:#f7fafb; }
        .amount { white-space:nowrap; }
        .footnote { margin-top:12px; color:#60717d; font-size:8.5px; }
        @media screen { body { max-width:1200px; padding:20px; margin:auto; } }
        @media screen and (max-width:760px) {
          .pdf-head { align-items:flex-start; }
          .head-left { gap:8px; }
          .brand-logo { width:98px; }
          h1 { font-size:14px; }
          .summary-item { padding:8px; }
          .summary-item strong { font-size:10px; }
          .scope { grid-template-columns:repeat(3,minmax(0,1fr)); }
        }
      </style></head><body>
      <header class="pdf-head">
        <div class="head-left">
          <img class="brand-logo" src="${reportLogo}" alt="ParkIn company logo" width="145" height="48" />
          <span class="brand-divider" aria-hidden="true"></span>
          <div class="report-headline"><span class="eyebrow">PARKING OPERATIONS / REPORTS</span>
            <h1>${html(title)}</h1>
            <p class="subtitle">${isBookings?'Detailed authorized booking records':'Live data not available'}</p>
          </div>
        </div>
        <div class="generated"><span class="document-label">PARKIN REPORTS</span>
          <strong>${html(generated)}</strong><small>Generated · Saudi Arabia time (AST)</small>
        </div>
      </header>
      <section class="summary" aria-label="Report summary">
        <div class="summary-item"><span class="summary-label">RECORDS</span><strong>${rows.length}</strong></div>
        <div class="summary-item"><span class="summary-label">EXPORT SCOPE</span><strong>${html(choice)}</strong></div>
        <div class="summary-item"><span class="summary-label">REPORTING PERIOD</span><strong>${html(dateRange)}</strong></div>
      </section>
      <div class="scope"><span><b>Company</b>${html(filters[0])}</span>
        <span><b>Location</b>${html(filters[1])}</span>
        <span><b>Parking type</b>${html(state.applied.type || 'All types')}</span>
        <span><b>Source</b>${html(filters[2])}</span><span><b>Status</b>${html(filters[3])}</span></div>
      <table aria-label="${html(title)}"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>
      ${isBookings?'<p class="footnote">Amounts are recorded booking values, not verified payments. Times shown in Saudi Arabia time.</p>':'<p class="footnote">This report category currently uses sample data.</p>'}
      </body></html>`;
  }
  // A separate, explicitly paginated A4 report reproduces the approved branded layout.
  // Keep this booking-only: the other seven prototype reports retain their existing export.
  function buildBookingRecordsPrintDocument(rows, cols, reportLogo, report) {
    const printDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
      ? new Intl.DateTimeFormat('en-GB', {day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
        .format(new Date(`${value}T12:00:00Z`)) : String(value || 'Not specified');
    // The Dashboard itself stores the signed-in profile here; it is display metadata only.
    let preparedFor = 'Authorized dashboard user';
    try {
      const profile = JSON.parse(window.localStorage.getItem('parkin_user') || 'null');
      if (profile && typeof profile.name === 'string' && profile.name.trim()) {
        preparedFor = profile.name.trim().slice(0,100);
      }
    } catch { /* Private browsing or unavailable local storage. */ }
    const colWeights = {id:10,date:11,customer:11,phone:10,vehicle:10,plate:9,type:10,
      location:11,driver:8,amount:7,status:9,source:8};
    const visible = [];
    for (const col of cols) {
      if (col.key === 'date') {
        visible.push({key:'date',label:'Booking Date & Time'});
      } else if (col.key === 'customer') {
        visible.push({key:'customer',label:'Customer'},{key:'phone',label:'Phone'});
      } else if (col.key === 'vehicle') {
        visible.push({key:'vehicle',label:'Vehicle'},{key:'plate',label:'Plate No.'});
      } else {
        visible.push({...col,label:col.key==='type'?'Parking Type':col.label});
      }
    }
    // Preserve the selected visible columns. Phone and plate are separate print columns.
    const weights = visible.reduce((sum,col)=>sum+(colWeights[col.key]||10),0);
    const widths = visible.map(col=>`<col style="width:${(100*(colWeights[col.key]||10)/weights).toFixed(2)}%">`).join('');
    const headings = visible.map(col=>`<th scope="col">${html(col.label)}</th>`).join('');
    const cell = (row,key) => {
      const value = key === 'date' ? printDate(row.date)
        : key === 'phone' ? (row.phone || '—')
        : key === 'plate' ? (row.plate || 'Not recorded')
        : key === 'amount' ? (typeof row.amount === 'number' && Number.isFinite(row.amount)
          ? `SAR ${row.amount.toLocaleString('en-US',{maximumFractionDigits:2})}` : 'Not recorded')
        : cellValue(row,key);
      if (key === 'date') return `<span>${html(value)}</span>${row.time?`<small>${html(row.time)} AST</small>`:''}`;
      if (key === 'status') {
        const status = String(row.status || row.statusGroup || '').toLowerCase();
        const tone = ['completed','confirmed'].includes(status)?'ok':
          ['cancelled','expired'].includes(status)?'bad':'open';
        return `<span class="status status-${tone}"><i aria-hidden="true"></i>${html(value)}</span>`;
      }
      return `<span>${html(value)}</span>`;
    };
    const renderRecord = row => `<tr>${visible.map(col=>`<td class="cell-${col.key}">${cell(row,col.key)}</td>`).join('')}</tr>`;

    // Conservative explicit pagination avoids split table rows and keeps footers aligned.
    // If a record has unusually lengthy notes/names, allocate fewer rows to that page.
    const pages=[];
    let position=0;
    while (position<rows.length) {
      const first=pages.length===0;
      const capacity=first?12:12;
      const part=[];
      let consumed=0;
      while (position<rows.length && consumed<capacity) {
        const record=rows[position];
        const long = visible.some(col=>String(record[col.key]??'').length>36);
        const cost=long?2:1;
        if (part.length && consumed+cost>capacity) break;
        part.push(record);position++;consumed+=cost;
      }
      pages.push(part);
    }
    const allAmounts=rows.filter(row=>typeof row.amount==='number' && Number.isFinite(row.amount));
    const totalAmount=allAmounts.reduce((sum,row)=>sum+row.amount,0);
    const amountLabel=allAmounts.length?`SAR ${totalAmount.toLocaleString('en-US',{maximumFractionDigits:2})}`:'Not recorded';
    const missingAmounts=rows.length-allAmounts.length;
    const labelCell=(label,value,icon) => `<div class="summary-card"><div class="s-icon" aria-hidden="true">${icon}</div><div><small>${html(label)}</small><strong>${html(value)}</strong></div></div>`;
    const meta = `<div class="meta-panel">
      <div><b>Generated</b><span>${html(report.generated)} AST</span></div>
      <div><b>Report Type</b><span>Booking</span></div>
      <div><b>Prepared For</b><span>${html(preparedFor)}</span></div>
      <div><b>Export Scope</b><span>${html(report.choice)}</span></div></div>`;
    const shell = (records,index) => {
      const first=index===0;const last=index===pages.length-1;
      const pageNumber=index+1;
      const overview=first?`<section class="summary-grid" aria-label="Booking report information">
        ${labelCell('Total Records',String(rows.length),'▤')}
        ${labelCell('Reporting Period',report.dateRange,'▦')}
        ${labelCell('Location Scope',report.location,'⌖')}
        ${labelCell('Company Scope',report.company,'▥')}
        ${labelCell('Time Zone','Saudi Arabia Time (AST)','◷')}
      </section><div class="filter-line"><b>Parking type:</b> ${html(state.applied.type || 'All types')}
         <b>Source:</b> ${html(state.applied.source || 'All sources')}
         <b>Status:</b> ${html(state.applied.status || 'All statuses')}</div>`:'';
      const finalSummary=last?`<section class="final-totals" aria-label="Report totals">
          <div><span class="total-icon">▤</span><p><small>Total Records</small><strong>${rows.length}</strong></p></div>
          <div><span class="total-icon">◈</span><p><small>Total Recorded Amount</small><strong>${html(amountLabel)}</strong></p></div>
        </section><section class="notes"><span class="notes-icon">▤</span><div><b>Notes</b><ul>
          <li>Amounts are recorded booking values, not verified payments.</li>
          ${missingAmounts?`<li>${missingAmounts} booking(s) have no recorded amount and are excluded from the amount total.</li>`:''}
          <li>Parking type reflects the vehicle classification, where available.</li>
          <li>Times shown in Saudi Arabia time (AST).</li>
        </ul></div></section>`:
        `<div class="continued-note">Continued on next page <span aria-hidden="true">→</span></div>`;
      return `<section class="pdf-page" aria-label="Page ${pageNumber} of ${pages.length}">
        <div class="page-top"><div class="brand-area">
          <img class="brand-logo" src="${reportLogo}" alt="ParkIn company logo" width="126" height="42" />
          <span class="brand-divider"></span><span class="eyebrow">PARKIN REPORTS</span>
        </div><div class="page-number">Page ${pageNumber} of ${pages.length}</div></div>
        <div class="title-row"><div class="title-copy"><h1>Booking Records Report</h1>
          <p>Detailed authorized booking records${first?'':' (continued)'}</p></div>${meta}</div>
        ${overview}
        <div class="report-table-container"><table aria-label="Booking Records Report"><colgroup>${widths}</colgroup>
          <thead><tr>${headings}</tr></thead><tbody>${records.map(renderRecord).join('')}</tbody></table></div>
        ${finalSummary}
        <footer class="page-footer"><span>ParkIn Reports <em>•</em> Generated from ParkIn Admin Dashboard</span>
          <span>Page ${pageNumber} of ${pages.length}</span></footer>
      </section>`;
    };
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>ParkIn_Booking_Records_${rows.length}</title><style>
        @page {size:A4 landscape; margin:0;}
        * {box-sizing:border-box;}
        html,body {margin:0; padding:0; background:#fff; color:#142638;}
        body {font:9px/1.35 Arial,Tahoma,'Noto Sans Arabic',sans-serif;
          -webkit-print-color-adjust:exact; print-color-adjust:exact;}
        .pdf-page {width:297mm; height:209.8mm; padding:14mm 12.5mm 9mm; margin:0 auto;
          display:flex; flex-direction:column; background:white; overflow:hidden;
          page-break-after:always; break-after:page;}
        .pdf-page:last-child {page-break-after:auto;break-after:auto;}
        .page-top {display:flex;justify-content:space-between;align-items:center; margin-bottom:6mm;}
        .brand-area {display:flex;align-items:center;gap:11px;min-height:28px;}
        .brand-logo {width:125px;height:41px;object-fit:contain;object-position:left center;}
        .brand-divider {height:28px;border-left:1px solid #bdcdd0;}
        .eyebrow {font-size:9px;font-weight:800;letter-spacing:.65px;color:#65788b;}
        .page-number {font-size:8.3px;color:#647389;}
        .title-row {display:flex;align-items:flex-start;justify-content:space-between;gap:20px;
          margin-bottom:4.5mm;}
        .title-copy {padding-top:6px;min-width:0;flex:1;}
        h1 {font-size:25px;font-weight:800;letter-spacing:-.7px;line-height:1.1;
          margin:0 0 6px;color:#00452e;}
        .title-copy p {color:#657589;font-size:12px;margin:0;}
        .meta-panel {flex:none;width:61mm;padding:9px 11px;border:1px solid #e1e8e9;
          border-radius:6px;background:#f6f9f8;font-size:8.2px;}
        .meta-panel div {display:grid;grid-template-columns:24mm 1fr;gap:4px;padding:2px 0;}
        .meta-panel b {color:#526980;font-weight:500;border-right:1px solid #d9e3e2;}
        .meta-panel span {font-weight:600;color:#273b41;overflow-wrap:anywhere;}
        .summary-grid {display:grid;grid-template-columns: .74fr 1.26fr 1fr 1fr 1fr;
          gap:5px;margin:0 0 3.5mm;}
        .summary-card {display:flex;align-items:center;gap:8px; min-width:0;
          padding:8px 7px;border:1px solid #e1e8e8;border-radius:5px;}
        .s-icon,.total-icon,.notes-icon {width:30px;height:30px;border-radius:50%;
          background:#e2f6ed;color:#008f5d;display:flex;align-items:center;
          justify-content:center;font-size:17px;font-weight:700;flex:none;}
        .summary-card small,.final-totals small {display:block;color:#66788a;font-size:8px;}
        .summary-card strong {display:block;color:#153146;font-size:9.3px;font-weight:700;
          line-height:1.2;overflow-wrap:anywhere;}
        .summary-card:first-child strong {font-size:18px;}
        .filter-line {font-size:7.8px;color:#617587;margin-bottom:4mm;}
        .filter-line b {color:#264e41;margin-left:11px;}
        .filter-line b:first-child {margin-left:0;}
        .report-table-container {width:100%;min-height:0;}
        table {table-layout:fixed;width:100%;border-collapse:collapse;font-size:8px;}
        thead {display:table-header-group;}
        th {background:#e5f4ec;color:#183e2e;font-size:7.3px;font-weight:800;
          text-align:left;padding:5px 3px;line-height:1.2;vertical-align:middle;
          border-bottom:1px solid #cce8d9;}
        td {padding:3.5px 3px;border-bottom:1px solid #e5eaea;
          vertical-align:top;color:#3b4d61;font-size:7.5px;
          overflow-wrap:anywhere;word-break:normal;line-height:1.2;}
        td span {display:block;}
        td small {font-size:6.9px;color:#7a8b9a;display:block;margin-top:1px;}
        tbody tr {break-inside:avoid;page-break-inside:avoid;}
        .cell-amount {white-space:nowrap;}
        .status {display:inline-flex;align-items:center;gap:3px;border-radius:3px;
          font-weight:700;font-size:7.2px;padding:3px 5px;white-space:nowrap;}
        .status i {width:5px;height:5px;border-radius:50%;background:currentColor;}
        .status-ok {background:#ddf7e9;color:#06794b;}
        .status-open {background:#e8f1ff;color:#2269cc;}
        .status-bad {background:#ffeaeb;color:#be414c;}
        .continued-note {text-align:right;margin-top:5mm;font-size:8px;color:#617588;}
        .final-totals {display:grid;grid-template-columns:1fr 1fr;margin-top:5mm;
          background:#eef9f2;border-radius:5px;}
        .final-totals>div {display:flex;align-items:center;gap:10px;padding:9px 18px;}
        .final-totals>div+div {border-left:1px solid #c4d9d1;}
        .final-totals p {margin:0;}
        .final-totals strong {font-size:14px;color:#074d36;display:block;}
        .notes {display:flex;gap:11px;margin-top:3mm;padding:10px 13px;
          background:#f5f8f8;border:1px solid #e5eaea;border-radius:5px;font-size:7.9px;}
        .notes b {color:#1b4338;}
        .notes ul {margin:4px 0 0;padding-left:14px;color:#425768;}
        .notes li {margin:1px 0;}
        .page-footer {display:flex;justify-content:space-between;align-items:center;gap:14px;
          margin-top:auto;padding-top:10px;border-top:1px solid #9db3bd;
          font-size:8px;color:#657588;}
        .page-footer em {color:#0a9560;font-style:normal;padding:0 6px;}
        @media screen {html{background:#edf2f4;}.pdf-page{margin:15px auto;
          box-shadow:0 2px 22px #dae0e4;}}
      </style></head><body>${pages.map(shell).join('')}</body></html>`;
  }

  function printRecordsOnly() {
    if (state.type !== 'bookings' || state.liveStatus !== 'ready') {
      showFeedback('Actual booking records have not loaded. PDF export is unavailable.');return;
    }
    const rows = rowsForExport();
    if (!rows.length) { showFeedback('No matching records to export as PDF.');return; }
    const cols = PRINT_COLUMNS.filter(col => !state.hiddenColumns.has(col.key));
    // A separate document means no dashboard header, KPI cards, charts or navigation.
    // It also stops browser print handlers from replacing a selected subset with all rows.
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden','true');
    frame.setAttribute('title','ParkIn records PDF print document');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0;opacity:0;pointer-events:none';
    let disposed = false;
    let fallbackTimer;
    const cleanup = () => { if(disposed)return;disposed=true;clearTimeout(fallbackTimer);frame.remove(); };
    frame.onload = () => {
      try {
        const printingWindow = frame.contentWindow;
        if (!printingWindow || typeof printingWindow.print !== 'function') throw new Error('Print unavailable');
        printingWindow.addEventListener('afterprint', () => setTimeout(cleanup,2000), {once:true});
        printingWindow.focus();
        printingWindow.print();
      } catch {
        cleanup();
        showFeedback('Unable to open the PDF print dialog. Check browser print permissions and retry.');
      }
    };
    frame.onerror = () => {cleanup();showFeedback('Unable to prepare the booking records PDF.');};
    frame.srcdoc = buildPrintDocument(rows,cols);
    fallbackTimer = setTimeout(cleanup,120000);
    document.body.appendChild(frame);
    showFeedback(`Preparing ${rows.length} ${state.selected.size?'selected':'matching'} records only. Choose “Save as PDF” in the print dialog.`,true);
  }
  function downloadCSV(){
    if(state.type!=='bookings'||state.liveStatus!=='ready'){showFeedback('Actual booking records have not loaded. Export is unavailable.');return;}
    const cols=COLUMN_MAP[state.type].filter(col=>!state.hiddenColumns.has(col.key));
    const chosen=rowsForExport();
    const lines=[cols.map(col=>csvCell(col.label)).join(','),...chosen.map(row=>cols.map(col=>csvCell(cellValue(row,col.key))).join(','))];
    const csv='\ufeff'+lines.join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`parkin-bookings-actual-${dateId(today())}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    showFeedback(`Exported ${chosen.length} actual records as Excel-compatible CSV.`,true);
  }
  function composeEmail(){
    const rows=rowsForExport();
    if(state.type!=='bookings'||state.liveStatus!=='ready'){showFeedback('Actual booking records have not loaded.');return;}
    const title=`ParkIn ${category().name} — actual booking summary`;
    const body=`Actual authorized booking records. Booking value does not prove payment.\nReport: ${category().name}\nPeriod: ${state.applied.from} to ${state.applied.to}\nMatching records: ${rows.length}\n\nFor full details, export the CSV from ParkIn Dashboard.`;
    window.location.href=`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    showFeedback('Your email application should open a draft. No email was sent automatically.',true);
  }
  function exportAction(id){closeMenus();
    if(state.type!=='bookings'){showFeedback('This report has no live integration yet. No export was generated.');return;}
    if(state.liveStatus!=='ready'){showFeedback('Actual booking records have not loaded. Export is unavailable.');return;}
    if(id==='csv')downloadCSV();
    if(id==='pdf')printRecordsOnly();
    if(id==='email')composeEmail();
    if(id==='schedule')showFeedback('Scheduled report delivery requires the future API/email integration. No job has been created.');
  }
  function showDetails(id){
    const row=state.viewRecords.find(item=>recordId(item)===id);if(!row)return;
    state.firstModalFocus=document.activeElement;
    qs('#pr-modal-title').textContent=`${category().singular} details · Actual`;
    qs('[data-modal-content]').innerHTML=COLUMN_MAP[state.type].map(col=>`<dt>${html(col.label)}</dt><dd>${html(cellValue(row,col.key))}</dd>`).join('');
    qs('[data-detail-dialog]').hidden=false;qs('[data-close-modal]').focus();
  }
  function closeDetails(){qs('[data-detail-dialog]').hidden=true;state.firstModalFocus?.focus?.();}
  function handleClick(event){
    if(!canOpenCategory(state.type))return;
    const action=event.target.closest('button');
    if(!action||!state.root.contains(action)){
      if(!event.target.closest('.pr-menu-host'))closeMenus();return;
    }
    if(action.dataset.reportType){switchCategory(action.dataset.reportType);return;}
    if(action.matches('[data-empty-clear-filters]')){viewAllAuthorizedBookings();return;}
    if(action.matches('[data-empty-add-booking]')){
      if(hasReportPermission('bookings.create') && hasReportPermission('customers.view')) window.location.hash='#customers';
      return;
    }
    if(action.matches('[data-live-refresh]')){loadLiveBookings();return;}
    if(action.matches('[data-reset]')){state.filters=defaultFilters();populateFilters();applyFilters(readFilters());showFeedback('Filters reset to the current month.',true);return;}
    if(action.matches('[data-export-toggle]')){toggleMenu('[data-export-toggle]','[data-export-menu]');return;}
    if(action.matches('[data-saved-toggle]')){renderPresets();toggleMenu('[data-saved-toggle]','[data-saved-menu]');return;}
    if(action.matches('[data-column-toggle]')){toggleMenu('[data-column-toggle]','[data-column-menu]');return;}
    if(action.dataset.export){exportAction(action.dataset.export);return;}
    if(action.matches('[data-save-preset],[data-use-preset],[data-delete-preset]')){handlePresetAction(action);return;}
    if(action.dataset.sort){if(state.sortKey===action.dataset.sort)state.sortDirection*=-1;else{state.sortKey=action.dataset.sort;state.sortDirection=1;}state.page=1;state.viewRecords=displayRows();renderTable(state.viewRecords);return;}
    if(action.matches('[data-page-prev]')){state.page=Math.max(1,state.page-1);renderTable(state.viewRecords);return;}
    if(action.matches('[data-page-next]')){state.page=Math.min(Math.max(1,Math.ceil(state.viewRecords.length/state.pageSize)),state.page+1);renderTable(state.viewRecords);return;}
    if(action.dataset.goPage){const page=Number(action.dataset.goPage);if(Number.isSafeInteger(page)&&page>=1&&page<=Math.max(1,Math.ceil(state.viewRecords.length/state.pageSize))){state.page=page;renderTable(state.viewRecords);}return;}
    if(action.dataset.showRecord){showDetails(action.dataset.showRecord);return;}
    if(action.matches('[data-close-modal]')){closeDetails();return;}
    if(!action.closest('.pr-menu-host'))closeMenus();
  }
  function handleChange(event){
    const item=event.target;
    if(item.matches('[data-page-size]')){const size=Number(item.value);if([8,16,32,64].includes(size)){state.pageSize=size;state.page=1;renderTable(state.viewRecords);}return;}
    if(item.matches('[data-column]')){const key=item.dataset.column;if(!item.checked&&COLUMN_MAP[state.type].length-state.hiddenColumns.size<=1){item.checked=true;showFeedback('At least one column must remain visible.');return;}item.checked?state.hiddenColumns.delete(key):state.hiddenColumns.add(key);renderTable(state.viewRecords);return;}
    if(item.matches('[data-select-record]')){item.checked?state.selected.add(item.dataset.selectRecord):state.selected.delete(item.dataset.selectRecord);renderTable(state.viewRecords);return;}
    if(item.matches('[data-select-page]')){state.viewRecords.slice((state.page-1)*state.pageSize,state.page*state.pageSize).forEach(row=>item.checked?state.selected.add(recordId(row)):state.selected.delete(recordId(row)));renderTable(state.viewRecords);}
  }
  async function loadLiveBookings(){
    if(!state.root||state.type!=='bookings'||!canOpenCategory('bookings'))return;
    const api=window.ParkinBookingReportAPI;
    state.liveController?.abort();
    const controller=new AbortController();state.liveController=controller;
    const request=++state.liveRequest;
    state.liveStatus='loading';state.liveError='';state.liveRows=[];state.companyNames=new Map();state.locationNames=new Map();
    state.selected.clear();state.page=1;renderAll();
    if(!api){state.liveStatus='error';state.liveError='Booking report API adapter is not available. Reload the Dashboard.';renderAll();return;}
    const token=localStorage.getItem('parkin_access_token');
    try {
      const apiBaseUrl=window.PARKIN_CONFIG?.apiBaseUrl || '';
      const rows=await api.fetchAll({apiBaseUrl,token,signal:controller.signal,
        onProgress:(count,total)=>{if(request===state.liveRequest){qs('[data-report-data-tag]').textContent=`Loading real bookings… ${count}/${total}`;}}
      });
      if(request!==state.liveRequest||controller.signal.aborted)return;
      // Optional, independently scoped directories: preserve legitimate options
      // even when they have zero booking records in the current result.
      const [companies,locations]=await Promise.all([
        api.loadCompanyNames({apiBaseUrl,token,signal:controller.signal}),
        api.loadLocationNames({apiBaseUrl,token,signal:controller.signal}),
      ]);
      if(request!==state.liveRequest||controller.signal.aborted)return;
      state.companyNames=companies;state.locationNames=locations;
      state.liveRows=rows;state.liveStatus='ready';
      // Only clear demo-era filter values, not valid zero-booking directory options.
      if(state.applied.company&&!companies.has(state.applied.company)&&!rows.some(r=>r.companyId===state.applied.company))state.applied.company='';
      if(state.applied.location&&!locations.has(state.applied.location)&&!rows.some(r=>r.locationId===state.applied.location))state.applied.location='';
      if(state.applied.type&&!rows.some(r=>r.type===state.applied.type))state.applied.type='';
      state.filters={...state.applied};
      populateFilters();renderAll();
      showFeedback(`Loaded ${rows.length.toLocaleString('en-US')} actual bookings. Filtered results reflect your account's access permissions.`,true);
    } catch(error){
      if(request!==state.liveRequest||controller.signal.aborted)return;
      state.liveRows=[];state.liveStatus='error';state.liveError=error?.message||'Could not load booking data.';
      populateFilters();renderAll();showFeedback(state.liveError);
    }
  }
  function refreshCategoryAccess() {
    if(!state.root)return;
    const allowed=visibleCategories();
    const previous=state.type;
    // Invalidate old API responses when account permissions or session changes.
    state.liveController?.abort();state.liveRequest++;
    state.liveRows=[];state.liveStatus='idle';state.liveError='';
    state.companyNames=new Map();state.locationNames=new Map();
    state.viewRecords=[];state.filteredBookings=[];
    state.selected.clear();state.page=1;
    if(!allowed.some(cat=>cat.id===state.type)) {
      state.type=allowed[0]?.id||null;
    }
    if(previous!==state.type){
      state.filters=defaultFilters();state.applied={...state.filters};
      state.sortKey=state.type==='users'||state.type==='bookings'||state.type==='revenue'?'date':'bookings';
      state.sortDirection=-1;state.hiddenColumns.clear();state.search='';
      qs('[data-search]').value='';
    }
    qs('[data-detail-dialog]').hidden=true;
    closeMenus();
    state.root.classList.toggle('pr-no-report-access',!allowed.length);
    qs('[data-reports-access-message]').hidden=allowed.length!==0;
    renderTabs();
    if(!allowed.length)return;
    populateFilters();renderAll();
    if(state.type==='bookings')loadLiveBookings();
  }
  function setup(root){
    if(root.dataset.reportsMounted==='true')return;
    root.dataset.reportsMounted='true';state.root=root;
    root.addEventListener('click',handleClick);
    root.addEventListener('change',handleChange);
    qs('[data-reports-filter-form]').addEventListener('submit',event=>{event.preventDefault();applyFilters(readFilters());});
    qs('[data-search]').addEventListener('input',event=>{state.search=event.target.value;state.page=1;state.selected.clear();const rows=displayRows();state.viewRecords=rows;renderTable(rows);});
    qs('[data-detail-dialog]').addEventListener('click',event=>{if(event.target===qs('[data-detail-dialog]'))closeDetails();});
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenus();if(!qs('[data-detail-dialog]').hidden)closeDetails();}});
    document.addEventListener('click',event=>{if(state.root&&!state.root.contains(event.target))closeMenus();});
    refreshCategoryAccess();
  }
  window.ParkinReports={mount:setup,
    getVisibleCategoryIds:()=>visibleCategories().map(cat=>cat.id),
    refreshAccess:refreshCategoryAccess};
  window.loadReportsPage=async function(container){
    const root=container?.querySelector('[data-reports-root]')||document.querySelector('#reports-view [data-reports-root]');
    if(root){
      if(root.dataset.reportsMounted==='true')refreshCategoryAccess();
      else setup(root);
    }
  };
})();
