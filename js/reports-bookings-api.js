/* Authenticated, scoped Bookings Report data adapter. No synthetic fallback. */
(() => {
  'use strict';
  if (window.ParkinBookingReportAPI) return;

  const STATUS_NAMES = Object.freeze({
    CONFIRMED:'Confirmed', VEHICLE_PARKED:'Vehicle Parked',
    RETURN_REQUESTED:'Return Requested', RETRIEVAL_IN_PROGRESS:'Retrieval In Progress',
    READY_FOR_HANDOVER:'Ready for Handover', COMPLETED:'Completed',
    CANCELLED:'Cancelled', EXPIRED:'Expired',
  });
  // Vehicle-level classification is available from the related vehicle, NOT Booking.bookingType.
  const PARKING_TYPES = Object.freeze({VALET_PARKING:'Valet Parking',WALK_IN:'Walk-in Parking'});
  const SOURCE_NAMES = Object.freeze({
    CUSTOMER_APP:'Customer App', VALET_DRIVER_APP:'Valet Driver App', DASHBOARD:'Dashboard',
  });
  const OPEN_STATUSES = new Set([
    'CONFIRMED','VEHICLE_PARKED','RETURN_REQUESTED',
    'RETRIEVAL_IN_PROGRESS','READY_FOR_HANDOVER',
  ]);
  const MAX_BOOKINGS = 10000; // Do not silently report incomplete totals.
  const dayFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  const saudiDay = input => {
    const instant = new Date(input);
    if (Number.isNaN(instant.getTime())) return '';
    const pieces = Object.fromEntries(dayFormatter.formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
    return `${pieces.year}-${pieces.month}-${pieces.day}`;
  };
  const safeText = value => String(value ?? '').trim();
  function normalizeBooking(booking) {
    if (!booking || typeof booking !== 'object' || !booking.id || !booking.createdAt) {
      throw new Error('Booking API returned incomplete booking records.');
    }
    const statusCode = safeText(booking.status);
    const customer = booking.customer || {};
    const vehicle = booking.vehicle || {};
    const location = booking.location || {};
    const amount = booking.amountSar == null ? null : Number(booking.amountSar);
    const plate = [vehicle.plateNumberEnglish, vehicle.plateLettersEnglish].filter(Boolean).join(' ');
    return {
      id:safeText(booking.bookingCode || booking.id), bookingId:safeText(booking.id),
      date:saudiDay(booking.createdAt),time:timeFormatter.format(new Date(booking.createdAt)),
      customer:safeText(customer.fullName) || 'Not recorded',
      phone:safeText(customer.phoneE164 || [customer.phoneCountryCode,customer.phoneNumber].filter(Boolean).join(' ')),
      vehicle:[vehicle.make,vehicle.model].filter(Boolean).join(' ') || 'Not recorded',
      plate:plate || safeText(vehicle.normalizedPlate) || 'Not recorded',
      type:PARKING_TYPES[vehicle.parkingType] || 'Not recorded',
      parkingTypeCode:PARKING_TYPES[vehicle.parkingType] ? vehicle.parkingType : '',
      location:safeText(location.name) || 'Unknown location',locationId:safeText(booking.locationId),
      company:safeText(booking.companyId),companyId:safeText(booking.companyId),
      driver:'Not recorded', // Driver assignment/name is not returned by this API.
      amount:Number.isFinite(amount) ? amount : null,
      paymentMethod:safeText(booking.paymentMethod) || 'Not recorded',
      paymentStatus:null, // A booking payment method or amount does not prove payment success.
      shiftCode:null, // Booking API does not join driver assignments / shift codes.
      status:STATUS_NAMES[statusCode] || (statusCode || 'Unknown'),
      statusCode,
      statusGroup:statusCode==='COMPLETED'?'Completed':statusCode==='CANCELLED'?'Cancelled':statusCode==='EXPIRED'?'Expired':OPEN_STATUSES.has(statusCode)?'Open':'Other',
      source:SOURCE_NAMES[booking.source] || safeText(booking.source) || 'Unknown',
    };
  }
  async function fetchJSON(url, token, signal) {
    const response = await fetch(url, {
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      cache:'no-store',signal,
    });
    if (!response.ok) {
      if (response.status===401) throw new Error('Session expired. Sign in again to view booking reports.');
      if (response.status===403) throw new Error('Access denied. The account needs bookings.view permission to load booking reports.');
      throw new Error(`Bookings API request failed (HTTP ${response.status}).`);
    }
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new Error('Bookings API returned an invalid response.');
    return body;
  }
  async function fetchAll({apiBaseUrl, token, signal, onProgress}) {
    if (!token) throw new Error('Please sign in to load booking reports.');
    if (!apiBaseUrl || !/^https?:\/\//.test(apiBaseUrl)) throw new Error('Booking API configuration is missing.');
    const base=apiBaseUrl.replace(/\/$/,'');
    const result=[];
    let total=null;
    let totalPages=null;
    for(let page=1;page<=MAX_BOOKINGS/100;page++) {
      const body=await fetchJSON(`${base}/bookings?page=${page}&limit=100`,token,signal);
      // The live NestJS response interceptor wraps controller results in
      // {success, path, timestamp, data}. Also accept unwrapped responses.
      const payload=body.data && typeof body.data==='object' ? body.data : body;
      const pagination=payload.pagination;
      if(!Array.isArray(payload.bookings)||!pagination||!Number.isSafeInteger(pagination.total)||pagination.total<0||!Number.isSafeInteger(pagination.totalPages)||pagination.totalPages<1) {
        throw new Error('Bookings API pagination is missing or invalid.');
      }
      if(total===null){
        total=pagination.total;
        totalPages=pagination.totalPages;
        if(total>MAX_BOOKINGS)throw new Error(`More than ${MAX_BOOKINGS} bookings are available. An API reporting endpoint is required for this volume; no partial report was shown.`);
        if(totalPages!==Math.max(1,Math.ceil(total/100)))throw new Error('Unexpected Bookings API page size.');
      }
      if(total!==pagination.total || totalPages!==pagination.totalPages || pagination.page!==page) {
        throw new Error('Bookings changed during report loading. Refresh to load a consistent result.');
      }
      result.push(...payload.bookings.map(normalizeBooking));
      onProgress?.(Math.min(result.length,total),total);
      if(page>=totalPages) {
        if(result.length!==total || new Set(result.map(row=>row.bookingId)).size!==result.length) {
          throw new Error('Booking data changed during loading. Refresh the report to retry.');
        }
        return result;
      }
    }
    throw new Error('Booking report safety limit exceeded. No incomplete report was shown.');
  }
  // Directory results are independently permission-scoped. Users lacking directory
  // permissions still get filter options drawn from their authorized booking rows.
  async function loadDirectory({apiBaseUrl,token,signal,kind}) {
    const result=new Map();
    const key=kind==='companies'?'companies':'locations';
    const base=apiBaseUrl.replace(/\/$/,'');
    let previousTotal=null;
    let pages=null;
    try {
      for(let page=1;page<=100;page++) {
        const body=await fetchJSON(`${base}/${kind}?page=${page}&limit=100`,token,signal);
        const payload=body.data && !Array.isArray(body.data) && typeof body.data==='object' ? body.data : body;
        const items=Array.isArray(payload[key])?payload[key]
          :Array.isArray(payload.items)?payload.items
          :Array.isArray(payload.data)?payload.data
          :Array.isArray(body.data)?body.data:null;
        if(!Array.isArray(items))throw new Error(`Invalid ${kind} directory response.`);
        for(const item of items) {
          if(item?.id && (item.name || item.code))result.set(item.id,item.name||item.code);
        }
        const pagination=payload.pagination || body.pagination;
        if(!pagination) {
          // A full unpaginated response may be truncated by a 100-item server cap.
          if(items.length>=100) throw new Error(`Cannot verify all ${kind} directory options.`);
          return result;
        }
        if(!Number.isSafeInteger(pagination.total)||pagination.total<0
           ||!Number.isSafeInteger(pagination.totalPages)||pagination.totalPages<1
           ||pagination.page!==page || (previousTotal!==null&&pagination.total!==previousTotal)
           || (pages!==null&&pagination.totalPages!==pages)){
          throw new Error(`Invalid ${kind} directory pagination.`);
        }
        previousTotal=pagination.total;pages=pagination.totalPages;
        if(page>=pages) {
          if(result.size!==previousTotal)throw new Error(`Incomplete ${kind} directory options.`);
          return result;
        }
      }
      throw new Error(`${kind} directory exceeds safe page limit.`);
    } catch(error) {
      if(signal?.aborted)throw error;
      // Directory access is optional; Bookings API remains the authority for records.
      return new Map();
    }
  }
  const loadCompanyNames = args => loadDirectory({...args,kind:'companies'});
  const loadLocationNames = args => loadDirectory({...args,kind:'locations'});
  window.ParkinBookingReportAPI=Object.freeze({fetchAll,loadCompanyNames,loadLocationNames,normalizeBooking,MAX_BOOKINGS});
})();
