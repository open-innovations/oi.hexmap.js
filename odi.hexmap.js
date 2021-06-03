(function(root){

	var ODI = root.ODI || {};
	if(!ODI.ready){
		ODI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}
	function AJAX(url,opt){
		// Version 1.1
		if(!opt) opt = {};
		var req = new XMLHttpRequest();
		var responseTypeAware = 'responseType' in req;
		if(responseTypeAware && opt.dataType) req.responseType = opt.dataType;
		req.open((opt.method||'GET'),url+(opt.cache ? '?'+Math.random() : ''),true);
		req.onload = function(e){
			if(this.status >= 200 && this.status < 400) {
				// Success!
				var resp = this.response;
				if(typeof opt.success==="function") opt.success.call((opt['this']||this),resp,{'url':url,'data':opt,'originalEvent':e});
			}else{
				// We reached our target server, but it returned an error
				if(typeof opt.error==="function") opt.error.call((opt['this']||this),e,{'url':url,'data':opt});
			}
		};
		if(typeof opt.error==="function"){
			// There was a connection error of some sort
			req.onerror = function(err){ opt.error.call((opt['this']||this),err,{'url':url,'data':opt}); };
		}
		req.send();
		return this;
	}
	if(!ODI.ajax) ODI.ajax = AJAX;

	// Display a hex map
	// Input structure:
	//    el: the element to attach to
	//    attr: an object defining various parameters:
	//      width: the width of the SVG element created
	//      height: the height of the SVG element created
	//      padding: an integer number of hexes to leave as padding around the displayed map
	//      showgrid: do we show the background grid?
	//      formatLabel: a function to format the hex label
	//      size: the size of a hexagon in pixels
	function HexMap(el,attr){

		this.version = "0.5";
		if(!attr) attr  = {};
		this._attr = attr;
		this.title = "ODI HexMap";
		this.logging = (location.search.indexOf('debug=true') >= 0);
		this.log = function(){
			// Version 1.1
			if(this.logging || arguments[0]=="ERROR" || arguments[0]=="WARNING"){
				var args = Array.prototype.slice.call(arguments, 0);
				// Build basic result
				var extra = ['%c'+this.title+'%c: '+args[1],'font-weight:bold;',''];
				// If there are extra parameters passed we add them
				if(args.length > 2) extra = extra.concat(args.splice(2));
				if(console && typeof console.log==="function"){
					if(arguments[0] == "ERROR") console.error.apply(null,extra);
					else if(arguments[0] == "WARNING") console.warn.apply(null,extra);
					else if(arguments[0] == "INFO") console.info.apply(null,extra);
					else console.log.apply(null,extra);
				}
			}
			return this;
		};

		if(!el){
			this.log('ERROR','Unable to find the element to draw into',el);
			return {};
		}

		if(typeof attr.padding!=="number") attr.padding = 0;

		var wide = attr.width || el.offsetWidth || 300;
		var tall = attr.height || el.offsetHeight || 150;
		var maxw = wide;
		var maxh = tall;
		var aspectratio = wide/tall;
		var constructed = false;
		var svg;
		var fs = 16;

		this.areas = {};
		this.properties = { 'size': attr.size };
		this.callback = {};
		this.mapping = {};

		
		// Add an inner element
		if(!el.querySelector('.hexmap-inner')){
			this.el = document.createElement('div');
			this.el.classList.add('hexmap-inner');
			el.appendChild(this.el);
		}

		this.options = {
			'showgrid':(typeof attr.grid==="boolean" ? attr.grid : false),
			'showlabel':(typeof attr.showlabel==="boolean" ? attr.showlabel : true),
			'formatLabel': (typeof attr.formatLabel==="function" ? attr.formatLabel : function(txt,attr){ return txt.substr(0,3); }),
			'minFontSize': (typeof attr.minFontSize==="number" ? attr.minFontSize : 4)
		};

		this.style = {
			'default': { 'fill': '#cccccc','fill-opacity':1,'font-size':fs,'stroke-width':1.5,'stroke-opacity':1,'stroke':'#ffffff' },
			'highlight': { 'fill': '#1DD3A7' },
			'grid': { 'fill': '#aaa','fill-opacity':0.1 }
		};

		for(var s in attr.style){
			if(attr.style[s]){
				if(!this.style[s]) this.style[s] = {};
				if(attr.style[s].fill) this.style[s].fill = attr.style[s].fill;
				if(attr.style[s]['fill-opacity']) this.style[s]['fill-opacity'] = attr.style[s]['fill-opacity'];
				if(attr.style[s]['font-size']) this.style[s]['font-size'] = attr.style[s]['font-size'];
				if(attr.style[s].stroke) this.style[s].stroke = attr.style[s].stroke;
				if(attr.style[s]['stroke-width']) this.style[s]['stroke-width'] = attr.style[s]['stroke-width'];
				if(attr.style[s]['stroke-opacity']) this.style[s]['stroke-opacity'] = attr.style[s]['stroke-opacity'];
			}
		}
		
		this.setFontSize = function(s){
			fs = s;
			this.log('MESSAGE','setFontSize',fs);
			this.style['default']['font-size'] = fs;

			for(var r in this.areas){
				if(this.areas[r].label) setAttr(this.areas[r].label,{'font-size':fs+'px'});
			}

			return this;
		}
		this.setHexSize = function(s){
			if(typeof s!=="number") s = 10;
			attr.size = s;
			this.properties.size = s;
			this.setFontSize(s*0.4);
			return this;
		}
		this.setHexSize(attr.size);

		// Can load a file or a hexjson data structure
		this.load = function(file,prop,fn){
			if(typeof prop==="function" && !fn){
				fn = prop;
				prop = "";
			}
			//if(typeof fn !== "function") return this;
			function done(data){
				_obj.log('INFO','HexJSON',data);
				_obj.setMapping(data);
				if(typeof fn==="function") fn.call(_obj,{'data':prop});
			}
			if(typeof file==="string"){
				this.log('INFO','Loading '+file,prop,fn);
				ODI.ajax(file,{
					'this': this,
					'dataType':'json',
					'success': function(data){ done(data); },
					'error': function(e,prop){ this.log('ERROR','Unable to load '+file,prop); }
				});
			}else if(typeof file==="object") done(file);
			return this;
		};

		var _obj = this;
		// We'll need to change the sizes when the window changes size
		window.addEventListener('resize', function(event){ _obj.resize(); });

		this.setHexStyle = function(r){
			var h,style,cls,p;
			h = this.areas[r];
			style = clone(this.style['default']);
			cls = "";

			if(h.active) style.fill = h.fillcolour;
			if(h.hover) cls += ' hover';
			if(h.selected){
				for(p in this.style.selected){
					if(this.style.selected[p]) style[p] = this.style.selected[p];
				}
				cls += ' selected';
			}
			//if(this.search.active) cls += (h.highlight) ? ' highlighted' : ' not-highlighted';
			style['class'] = 'hex-cell'+cls;

			setAttr(h.hex,style);

			if(h.label) setAttr(h.label,{'class':'hex-label'+cls});

			return h;
		};
		
		this.toFront = function(r){
			this.log('INFO','toFront',r);
			if(this.areas[r]){
				// Simulate a change of z-index by moving elements to the end of the SVG
				// Keep selected items on top
				for(var region in this.areas){
					if(this.areas[region].selected){
						console.log(region);
						add(this.areas[region].hex,svg);
						add(this.areas[region].label,svg);
					}
				}
				// Simulate a change of z-index by moving this element (hex and label) to the end of the SVG
				add(this.areas[r].hex,svg);
				add(this.areas[r].label,svg);
			}
			return this;
		};

		this.regionToggleSelected = function(r,others){
			this.selected = (this.selected==r) ? "" : r;
			var h = this.areas[r];
			h.selected = !h.selected;
			this.setHexStyle(r);
			var region;

			// If we've deselected a region, deselect any other regions selected
			if(!h.selected){
				if(others){
					for(region in this.areas){
						if(this.areas[region].selected){
							this.areas[region].selected = false;
							this.setHexStyle(region);
						}
					}
				}
			}
			return this;
		};

		this.regionFocus = function(r){
			var h = this.areas[r];
			h.hover = true;
			this.el.querySelectorAll('.hover').forEach(function(el){ el.classList.remove('hover'); });
			this.setHexStyle(r);
			this.toFront(r);
			return this;
		};

		this.regionBlur = function(r){
			var h = this.areas[r];
			h.hover = false;
			this.setHexStyle(r);
			return this;
		};

		this.regionActivate = function(r){
			var h = this.areas[r];
			h.active = true;
			this.setHexStyle(r);
		};

		this.regionDeactivate = function(r){
			var h = this.areas[r];
			h.active = false;
			this.setHexStyle(r);
		};

		this.regionToggleActive = function(r){
			var h = this.areas[r];
			h.active = !h.active;
			this.setHexStyle(r);
		};

		this.selectRegion = function(r){
			this.selected = r;
			var h;
			for(var region in this.areas){
				if(this.areas[region]){
					h = this.areas[region];
					if(r.length > 0 && region.indexOf(r)==0){
						h.selected = true;
						this.setHexStyle(region);
					}else{
						h.selected = false;
						this.setHexStyle(region);
					}
				}
			}
			return this;
		};

		// Add events (mouseover, mouseout, click)	
		this.on = function(type,prop,fn){
			if(typeof prop==="function" && !fn){
				fn = prop;
				prop = "";
			}
			if(typeof fn !== "function") return this;
			if(!this.callback) this.callback = {};
			this.callback[type] = { 'fn': fn, 'attr': prop };
			return this;
		};

		// Move the selected hex to the new coordinates
		this.moveTo = function(q,r){
			if(this.selected){
				var dq = q - this.mapping.hexes[this.selected].q;
				var dr = r - this.mapping.hexes[this.selected].r;

				for(var region in this.areas){
					if(this.areas[region]){
						if(region.indexOf(this.selected)==0){
							this.areas[region].selected = true;
						}
						if(this.areas[region].selected){
							this.mapping.hexes[region].q += dq;
							this.mapping.hexes[region].r += dr;
							var h = this.drawHex(this.mapping.hexes[region].q,this.mapping.hexes[region].r);
							this.areas[region].attr({'path':h.path}).update();
							if(this.options.showlabel && this.areas[region].label) setAttr(this.areas[region].label,{'x':h.x,'y':h.y+this.style['default']['font-size']/2,'clip-path':'hex-clip-'+this.mapping.hexes[region].q+'-'+this.mapping.hexes[region].r});
							this.areas[region].selected = false;
							this.setHexStyle(region);
						}
					}
				}
				this.selected = "";
			}
		};

		this.size = function(w,h){
			this.log('INFO','size',w,h);
			this.el.style.height = '';
			this.el.style.width = '';
			setAttr(el,{'style':''})
			if(svg) setAttr(svg,{'width':0,'height':0})
			w = Math.min(maxw,el.offsetWidth);
			this.el.style.height = (w/aspectratio)+'px';
			this.el.style.width = w+'px';
			h = Math.min(maxh,this.el.offsetHeight);
			
			// Create SVG container
			if(!svg){
				svg = svgEl('svg');
				setAttr(svg,{'xmlns':ns,'version':'1.1','overflow':'visible','viewBox':(attr.viewBox||'0 0 '+w+' '+h),'style':'max-width:100%;','preserveAspectRatio':'xMinYMin meet','vector-effect':'non-scaling-stroke','overflow':'hidden'});
				add(svg,this.el);
			}
			setAttr(svg,{'width':w,'height':h});
			setAttr(el,{'style':'width:'+w+'px;height:'+h+'px'});
			
			var scale = w/wide;
			this.properties.size = attr.size*scale;
			wide = w;
			tall = h;
			//this.transform = {'type':'scale','props':{x:w,y:h,cx:w,cy:h,r:w,'stroke-width':w}};
			this.el.style.height = '';
			this.el.style.width = '';

			return this;
		};

		this.resize = function(){
			console.log('resize',svg);
			this.size();
			return this;
		};

		this.initialized = function(){
			this.create().draw();
			var spin = el.querySelector('.spinner');
			if(spin) spin.parentNode.removeChild(spin);
			return this;
		};

		this.create = function(){
			// Clear the canvas
			svg.innerHTML = "";
			constructed = false;
			return this;
		};

		this.setMapping = function(mapping){
			this.mapping = mapping;
			if(!this.properties) this.properties = { "x": 100, "y": 100 };
			this.properties.x = wide/2;
			this.properties.y = tall/2;
			this.setSize();
			var p = mapping.layout.split("-");
			this.properties.shift = p[0];
			this.properties.orientation = p[1];

			return this.initialized();
		};

		this.setSize = function(size){
			if(size) this.properties.size = size;
			this.properties.s = { 'cos': this.properties.size*Math.sqrt(3)/2, 'sin': this.properties.size*0.5 };
			this.properties.s.c = this.properties.s.cos.toFixed(2);
			this.properties.s.s = this.properties.s.sin.toFixed(2);
			return this;
		};

		this.drawHex = function(q,r,scale){
			if(this.properties){
				var x,y,cs,ss,path;
				if(typeof scale!=="number") scale = 1;
				scale = Math.sqrt(scale);

				x = this.properties.x + (q * this.properties.s.cos * 2);
				y = this.properties.y - (r * this.properties.s.sin * 3);

				if(this.properties.orientation == "r"){
					if(this.properties.shift=="odd" && (r&1) == 1) x += this.properties.s.cos;
					if(this.properties.shift=="even" && (r&1) == 0) x += this.properties.s.cos;
				}
				if(this.properties.orientation == "q"){
					if(this.properties.shift=="odd" && ((q&1) == 1)) y += this.properties.s.cos;
					if(this.properties.shift=="even" && ((q&1) == 0)) y += this.properties.s.cos;
				}

				path = [['M',[x,y]]];
				cs = this.properties.s.c * scale;
				ss = this.properties.s.s * scale;
				if(this.properties.orientation == "r"){
					// Pointy topped
					path.push(['m',[cs,-ss]]);
					path.push(['l',[-cs,-ss,-cs,ss,0,(this.properties.size*scale).toFixed(2),cs,ss,cs,-ss]]);
					path.push(['z',[]]);
				}else{
					// Flat topped
					path.push(['m',[-ss,cs]]);
					path.push(['l',[-ss,-cs,ss,cs,(this.properties.size*scale).toFixed(2),0,ss,cs,-ss,cs]]);
					path.push(['z',[]]);
				}
				return { 'array':path,'path':toPath(path),'x':x,'y':y };
			}
			return this;
		};

		this.updateColours = function(fn){
			this.log('MESSAGE','updateColours',fn);
			if(fn) attr.colours = fn;
			if(!attr.colours) attr.colours = function(){ return this.style['default'].fill; };
			for(var region in this.mapping.hexes){
				if(this.mapping.hexes[region]){
					if(typeof attr.colours==="string") this.areas[region].fillcolour = attr.colours;
					else this.areas[region].fillcolour = attr.colours.call(this,region);
					this.setHexStyle(region);
				}
			}

			return this;
		};
		
		this.draw = function(){
			console.log('draw');

			var r,q,h,region;

			var range = { 'r': {'min':1e100,'max':-1e100}, 'q': {'min':1e100,'max':-1e100} };
			for(region in this.mapping.hexes){
				if(this.mapping.hexes[region]){
					q = this.mapping.hexes[region].q;
					r = this.mapping.hexes[region].r;
					if(q > range.q.max) range.q.max = q;
					if(q < range.q.min) range.q.min = q;
					if(r > range.r.max) range.r.max = r;
					if(r < range.r.min) range.r.min = r;
				}
			}
			
			// Add padding to range
			range.q.min -= attr.padding;
			range.q.max += attr.padding;
			range.r.min -= attr.padding;
			range.r.max += attr.padding;
		
			// q,r coordinate of the centre of the range
			var qp = (range.q.max+range.q.min)/2;
			var rp = (range.r.max+range.r.min)/2;
			
			this.properties.x = (wide/2) - (this.properties.s.cos * 2 *qp);
			this.properties.y = (tall/2) + (this.properties.s.sin * 3 *rp);
			
			// Store this for use elsewhere
			this.range = range;
			
			var events = {
				'mouseover': function(e){
					var t = 'mouseover';
					e.data.hexmap.regionFocus(e.data.region);
					if(e.data.hexmap.callback[t]){
						for(var a in e.data.hexmap.callback[t].attr){
							if(e.data.hexmap.callback[t].attr[a]) e.data[a] = e.data.hexmap.callback[t].attr[a];
						}
						if(typeof e.data.hexmap.callback[t].fn==="function") return e.data.hexmap.callback[t].fn.call(this,e);
					}
				},
				'mouseout': function(e){
					var t = 'mouseout';
					if(e.data.hexmap.callback[t]){
						for(var a in e.data.hexmap.callback[t].attr){
							if(e.data.hexmap.callback[t].attr[a]) e.data[a] = e.data.hexmap.callback[t].attr[a];
						}
						if(typeof e.data.hexmap.callback[t].fn==="function") return e.data.hexmap.callback[t].fn.call(this,e);
					}
				},
				'click': function(e){
					var t = 'click';
					e.data.hexmap.regionFocus(e.data.region);
					if(e.data.hexmap.callback[t]){
						for(var a in e.data.hexmap.callback[t].attr){
							if(e.data.hexmap.callback[t].attr[a]) e.data[a] = e.data.hexmap.callback[t].attr[a];
						}
						if(typeof e.data.hexmap.callback[t].fn==="function") return e.data.hexmap.callback[t].fn.call(this,e);
					}
				}
			};
			
			if(this.options.showgrid){
				this.grid = [];
			
				for(q = range.q.min; q <= range.q.max; q++){
					for(r = range.r.min; r <= range.r.max; r++){
						h = this.drawHex(q,r);
						this.grid.push(this.paper.path(h.path).attr({'class':'hex-grid','data-q':q,'data-r':r,'fill':(this.style.grid.fill||''),'fill-opacity':(this.style.grid['fill-opacity']||0.1),'stroke':(this.style.grid.stroke||'#aaa'),'stroke-opacity':(this.style.grid['stroke-opacity']||0.2)}));
						this.grid[this.grid.length-1].on('mouseover',{type:'grid',hexmap:this,data:{'r':r,'q':q}},events.mouseover)
							.on('mouseout',{type:'grid',hexmap:this,me:_obj,data:{'r':r,'q':q}},events.mouseout)
							.on('click',{type:'grid',hexmap:this,region:region,me:_obj,data:{'r':r,'q':q}},events.click);
							
						// Make all the clipping areas
						this.paper.clip({'path':h.path,'type':'path'}).attr({'id':'hex-clip-'+q+'-'+r});
					}
				}
			}

			var min = 50000;
			var max = 80000;
			this.values = {};
			var _obj = this;
			var path,label;

			for(region in this.mapping.hexes){
				if(this.mapping.hexes[region]){
					this.values[region] = (this.mapping.hexes[region].p - min)/(max-min);
					if(this.values[region].value < 0) this.values[region] = 0;
					if(this.values[region].value > 1) this.values[region] = 1;

					h = this.drawHex(this.mapping.hexes[region].q,this.mapping.hexes[region].r);

					if(!constructed){
						path = svgEl('path');
						setAttr(path,{'d':h.path,'class':'hex-cell','data-q':this.mapping.hexes[region].q,'data-r':this.mapping.hexes[region].r,'id':'hex-'+region,'aria-title':(this.mapping.hexes[region].n || region)});
						svg.appendChild(path);
						this.areas[region] = {'hex':path,'selected':false,'active':true};

						// Attach events to our SVG hex nodes
						addEvent('mouseover',path,{type:'hex',hexmap:this,region:region,data:this.mapping.hexes[region],pop:this.mapping.hexes[region].p},events.mouseover);
						addEvent('mouseout',path,{type:'hex',hexmap:this,region:region,me:this.areas[region]},events.mouseout);
						addEvent('click',path,{type:'hex',hexmap:this,region:region,me:this.areas[region],data:this.mapping.hexes[region]},events.click);

						if(this.options.showlabel){
							if(this.style['default']['font-size'] >= this.options.minFontSize){
								label = svgEl('text');
								label.innerHTML = this.options.formatLabel(this.mapping.hexes[region].n,{'size':this.properties.size,'font-size':this.style['default']['font-size']});
								setAttr(label,{'x':h.x,'y':h.y+this.style['default']['font-size']/2,'id':'hex-'+region+'-label','clip-path':'hex-clip-'+this.mapping.hexes[region].q+'-'+this.mapping.hexes[region].r,'data-q':this.mapping.hexes[region].q,'data-r':this.mapping.hexes[region].r,'class':'hex-label','text-anchor':'middle','font-size':this.style['default']['font-size']+'px','title':(this.mapping.hexes[region].n || region),'_region':region});
								svg.appendChild(label);
								this.areas[region].label = label;
								this.areas[region].labelprops = {x:h.x,y:h.y};

								// Attach events to our SVG label nodes
								addEvent('mouseover',label,{type:'hex',hexmap:this,region:region,data:this.mapping.hexes[region],pop:this.mapping.hexes[region].p},events.mouseover);
								addEvent('mouseout',label,{type:'hex',hexmap:this,region:region,me:this.areas[region]},events.mouseout);
								addEvent('click',label,{type:'hex',hexmap:this,region:region,me:this.areas[region],data:this.mapping.hexes[region]},events.click);
							}
						}

					}
					this.setHexStyle(region);
					setAttr(this.areas[region].hex,{'stroke':this.style['default'].stroke,'stroke-opacity':this.style['default']['stroke-opacity'],'stroke-width':this.style['default']['stroke-width'],'title':this.mapping.hexes[region].n,'data-regions':region,'style':'cursor: pointer;'});
				}
			}

			constructed = true;

			return this;
		};

		this.selectBySameColour = function(){
			if(this.selected){
				for(var region in this.areas){
					if(this.areas[region].fillcolour==this.areas[this.selected].fillcolour){
						this.areas[region].selected = true;
						this.setHexStyle(region);
					}
				}
			}
			return this;
		};
			
		this.size();
		if(attr.file) this.load(attr.file,attr.ready);

		return this;
	
	}
	ODI.hexmap = function(el,attr){ return new HexMap(el,attr); };

	// Helper functions
	var ns = 'http://www.w3.org/2000/svg';
	function prepend(el,to) { to.insertBefore(el, to.firstChild); }
	function add(el,to){ return to.appendChild(el); }
	function clone(a){ return JSON.parse(JSON.stringify(a)); }
	function setAttr(el,prop){
		for(var p in prop) el.setAttribute(p,prop[p]);
		return el;
	}
	function svgEl(t){ return document.createElementNS(ns,t); }
	function addEvent(ev,el,attr,fn){
		if(el){
			if(!el.length) el = [el];
			if(typeof fn==="function"){
				el.forEach(function(elem){
					elem.addEventListener(ev,function(e){
						e.data = attr;
						fn.call(attr['this']||this,e);
					});
				});
			}
		}
	}
	function toPath(p) {
		var str = '';
		for(var i = 0; i < p.length; i++) str += ((p[i][0]) ? p[i][0] : ' ')+(p[i][1].length > 0 ? p[i][1].join(',') : ' ');
		return str;
	}

	root.ODI = ODI;

})(window || this);