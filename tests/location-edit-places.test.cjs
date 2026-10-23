const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root,'script.js'), 'utf8');
const html = fs.readFileSync(path.join(root,'index.html'), 'utf8');
const places = fs.readFileSync(path.join(root,'js/location-address-autocomplete.js'), 'utf8');
const css = fs.readFileSync(path.join(root,'styles.css'), 'utf8');
function createHarness(){
  const names=['name','type','city','district','address','latitude','longitude','postalCode','contactPhone','email','website','timezone','openingTime','closingTime','capacity','notes'];
  const fields=Object.fromEntries(names.map(n=>[n,{value:'',options:[]}]));
  const counter={textContent:''};
  const radioActive={checked:true},radioInactive={checked:false};
  const radioLabels=[{checked:()=>radioActive.checked},{checked:()=>radioInactive.checked}].map(x=>({classList:{toggle:(cls,truth)=>{assert.equal(cls,'selected');}},querySelector:()=>({checked:x.checked()})}));
  fields.city.options=[{value:'Riyadh'}];
  fields.city.appendChild=function(opt){ this.options.push(opt); };
  const elements={namedItem:n=>fields[n]??null};
  let imageSrc='', hidden=true, imgName='', imgMeta='', edits=[];
  const img={set src(v){ imageSrc=v; },get src(){return imageSrc;},removeAttribute(){imageSrc='';}};
  const card={set hidden(v){hidden=v},get hidden(){return hidden},querySelector:q=>q==='img'?img:q==='b'?{set textContent(v){imgName=v}}:q==='small'?{set textContent(v){imgMeta=v}}:null};
  const form={dataset:{},name:'HTML FORM NATIVE name ATTRIBUTE',elements,
    reset(){names.forEach(n=>fields[n].value='');},
    dispatchEvent(e){edits.push(e.type)},
    querySelector:q=>q==='.preview-card'?card:q==='.textarea-count'?counter:q==='.save-location'?{textContent:'Save Location'}:q.includes('status')?(q.includes('INACTIVE')?radioInactive:radioActive):null,
    querySelectorAll:q=>q.includes('.status-select')?radioLabels:[],
  };
  const context={document:{createElement:()=>({dataset:{}})},addLocationForm:form,locationImageInput:{value:''},getImageUrl:x=>'/server'+x,CustomEvent:class {constructor(type){this.type=type}}};
  const begin=js.indexOf('/** Read/write fields through elements');
  const end=js.indexOf('locationSearch?.addEventListener',begin);
  const code=js.slice(begin,end).replace(/addLocationForm\?\.querySelector\('[^']+'\)\?\.addEventListener[^;]+;/g,'');
  // supply addEventListener no-op to notes and status radios
  Object.values(fields).forEach(f=>{f.addEventListener=()=>{}});
  radioActive.addEventListener=radioInactive.addEventListener=()=>{};
  form.querySelectorAll=()=>radioLabels.map(l=>({...l,addEventListener:()=>{}}));
  vm.createContext(context);vm.runInContext(code,context);
  return {context,fields,form,getSummary:()=>({counter:counter.textContent,imgName,imgMeta,imageSrc,hidden,edits})};
}
test('all 16 edit fields populate through form.elements (including reserved form.name)',()=>{
  const h=createHarness();
  const location={id:'test-location',name:'Premium Centre',type:'SHOPPING_MALL',city:'Riyadh',district:'Al Olaya',address:'King Fahd Road',latitude:'24.7110000',longitude:'46.6770000',postalCode:'12345',contactPhone:'+966500000001',email:'test@example.com',website:'https://example.com',timezone:'Asia/Riyadh',openingTime:'09:30',closingTime:'23:45',capacity:89,notes:'Outdoor valet entrance',status:'INACTIVE',imageUrl:'/uploads/locations/valet.png'};
  vm.runInContext('fillLocationForm(location)',vm.createContext({...h.context,location}));
  for(const key of Object.keys(h.fields)) assert.equal(h.fields[key].value,location[key]===undefined?'':String(location[key]),key);
  assert.equal(h.form.dataset.editId,'test-location');
  assert.match(h.getSummary().imageSrc,/valet.png/);
  assert.equal(h.getSummary().hidden,false);
  assert.equal(h.getSummary().counter,'22 / 500');
  assert.ok(h.getSummary().edits.includes('parkin:location-form-loaded'));
});
test('edit with absent coordinates leaves them empty rather than fake zeros',()=>{
  const h=createHarness();
  vm.runInContext('fillLocationForm(location)',vm.createContext({...h.context,location:{id:'test',name:'A',latitude:null,longitude:null}}));
  assert.equal(h.fields.latitude.value,'');assert.equal(h.fields.longitude.value,'');
});
test('address lookup supports 3 characters, Saudi-only, place geometry and editable fields',()=>{
  assert.match(places,/count\(text\) < 3/);
  assert.match(places,/includedRegionCodes: \['sa'\]/);
  assert.match(places,/location', 'addressComponents'/);
  assert.match(places,/toFixed\(7\)/);
  assert.match(places,/field\('latitude'\)\.value = ''/);
  assert.match(places,/field\('longitude'\)\.value = ''/);
  assert.match(places,/Google location selected/);
  assert.match(html,/src="\/js\/location-address-autocomplete\.js"/);
  assert.match(css,/location-google-suggestions\[hidden\]/);
});
test('PATCH preserves all FormData values, file upload and edit ID',()=>{
  assert.match(js,/const formData = new FormData\(addLocationForm\)/);
  assert.match(js,/const editId = addLocationForm\.dataset\.editId/);
  assert.match(js,/method = editId \? "PATCH" : "POST"/);
});
test('edit permission is independent of create, and reset prevents stale edit IDs',()=>{
  assert.match(js,/route\.name === "add-location"\) return addLocationForm\?\.dataset\.editId \? "locations\.edit" : "locations\.create"/);
  assert.match(js,/function resetLocationForm\(\)/);
  assert.match(js,/delete addLocationForm\.dataset\.editId/);
  assert.match(js,/if \(!hasDashboardPermission\("locations\.edit"\)\)/);
});

test('a selected Google Place actually writes address, latitude, longitude, district, city and postcode',async()=>{
  class FakeElement {
    constructor(tag='div'){
      this.tag=tag;this.value='';this.dataset={};this.attrs={};this.hidden=false;this.isConnected=true;this.children=[];this.handlers={};this.options=[];
      this.classList={toggle(){}};
      this.appendChild=(child)=>{ this.options.push(child); };
    }
    setAttribute(k,v){this.attrs[k]=v}
    removeAttribute(k){delete this.attrs[k]}
    insertAdjacentElement(_side,el){this.sibling=el}
    replaceChildren(){this.children=[]}
    append(...children){this.children.push(...children)}
    addEventListener(event,fn){(this.handlers[event] ||= []).push(fn)}
    dispatchEvent(ev){for(const fn of this.handlers[ev.type] || [])fn(ev)}
    querySelectorAll(selector){return selector==='[role="option"]' ? this.children.filter(x=>x.attrs.role==='option') : []}
    focus(){}
  }
  const fields={};
  for(const key of ['address','latitude','longitude','city','district','postalCode']) fields[key]=new FakeElement('input');
  fields.city.options=[{value:''},{value:'Riyadh'},{value:'Jeddah'}];
  const form=new FakeElement('form');
  form.elements={namedItem:(name)=>fields[name]};
  const document={
    querySelector:()=>form,
    createElement:(tag)=>new FakeElement(tag),
  };
  const place={
    formattedAddress:'Al Murabba, Riyadh, Saudi Arabia',
    location:{lat:()=>24.7136,lng:()=>46.6753},
    addressComponents:[
      {types:['sublocality_level_1'],longText:'Al Murabba'},
      {types:['locality'],longText:'Riyadh'},
      {types:['postal_code'],longText:'12628'},
    ],
    async fetchFields(){},
  };
  const prediction={mainText:{text:'Al Murabba'},secondaryText:{text:'Riyadh'},text:{text:'Al Murabba, Riyadh'},toPlace:()=>place};
  const requests=[];
  const window={
    google:{maps:{importLibrary:async()=>({AutocompleteSuggestion:{fetchAutocompleteSuggestions:async(arg)=>{requests.push(arg);return {suggestions:[{placePrediction:prediction}]}}}})}},
  };
  const ctx={document,window,setTimeout(fn){fn()},clearTimeout(){},Event:class{constructor(type){this.type=type}}};
  vm.runInNewContext(places,ctx);
  fields.address.value='Mur';
  fields.address.dispatchEvent({type:'input'});
  for(let i=0;i<12;i++)await Promise.resolve();
  const list=fields.address.sibling;
  assert.equal(requests.length,1);
  assert.equal(requests[0].input,'Mur');
  assert.equal(requests[0].includedRegionCodes[0],'sa');
  assert.equal(list.hidden,false);
  list.children[0].dispatchEvent({type:'click'});
  for(let i=0;i<15;i++)await Promise.resolve();
  assert.equal(fields.address.value,'Al Murabba, Riyadh, Saudi Arabia');
  assert.equal(fields.latitude.value,'24.7136000');
  assert.equal(fields.longitude.value,'46.6753000');
  assert.equal(fields.city.value,'Riyadh');
  assert.equal(fields.district.value,'Al Murabba');
  assert.equal(fields.postalCode.value,'12628');
  fields.address.value='Manually edited address';
  fields.address.dispatchEvent({type:'input'});
  assert.equal(fields.latitude.value,'');
  assert.equal(fields.longitude.value,'');
});

test('unlisted Saudi city and suspended status do not silently revert during Edit Location',()=>{
  const h=createHarness();
  const city={id:'l1',city:'Taif',status:'SUSPENDED'};
  vm.runInContext('fillLocationForm(location)',vm.createContext({...h.context,location:city}));
  assert.equal(h.fields.city.value,'Taif');
  assert.ok(h.fields.city.options.some(x=>x.value==='Taif'));
  assert.match(html,/value="SUSPENDED"/);
  for(const kind of ['AIRPORT','HOSPITAL','OTHER']) assert.ok(html.includes(`value="${kind}"`));
});

test('Location Details displays persisted coordinates and all editable operational details',()=>{
  for(const field of ['district','postal','latitude','longitude','website','timezone','opening','closing']) assert.match(js,new RegExp(`details-${field}`));
  assert.match(js,/location\.latitude/); assert.match(js,/location\.longitude/);
});
