/**
	Open Innovations hex map in SVG v0.8.3
 */
(function(root){

	var OI = root.OI || {};
	if(!OI.ready){
		OI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}

	// Input structure:
	//		el: the element to attach to
	//		attr: an object defining various parameters:
	//			width: the width of the SVG element created
	//			height: the height of the SVG element created
	//			padding: an integer number of hexes to leave as padding around the displayed map
	//			grid: do we show the background grid?
	//			clip: do we clip the text to the hex?
	//			formatLabel: a function to format the hex label
	//			size: the size of a hexagon in pixels
	function HexMap(el,attr){

		this.version = "0.8.3";
		if(!attr) attr	= {};
		this._attr = attr;
		this.title = "OI HexMap";
		this.logging = (location.search.indexOf('debug=true') >= 0);
		var log = new Log({"title":"OI HexMap","version":this.version});
		this.log = log.message;

		if(!el){
			this.log('warn','No DOM element to add to');
			return this;
		}

		if(!attr.label) attr.label = {};
		if(!attr.tooltip) attr.tooltip = {};
		if(!attr.grid) attr.grid = {};
		if(typeof attr.label.show!=="boolean") attr.label.show = false;
		if(typeof attr.label.clip!=="boolean") attr.label.clip = false;
		if(typeof attr.grid.show!=="boolean") attr.grid.show = false;

		var wide = attr.width || el.offsetWidth || 300;
		var tall = attr.height || el.offsetHeight || 150;
		this.maxw = wide;
		this.maxh = tall;
		var aspectratio = wide/tall;
		var constructed = false;
		var svg,hexes,lines,overlay,datalayer,grid;
		var range = {};
		var fs = parseFloat(getComputedStyle(el)['font-size'])||16;
		var hovered = null;
		this.areas = {};
		this.padding = (typeof attr.padding==="number" ? attr.padding : 0);
		this.properties = { 'size': attr.size };
		this.callback = {};
		this.mapping = {};
		var _obj = this;

		el.classList.add('oi-viz','oi-map','oi-map-hex');
		
		// Add an inner element
		if(!el.querySelector('.hexmap-inner')){
			var otop = document.createElement('div');
			otop.classList.add('oi-top');
			otop.innerHTML = '<div class="oi-left"></div><div class="oi-right"></div>';
			add(otop,el);
			var holder = document.createElement('div');
			holder.classList.add('oi-map-holder');
			add(holder,el);
			var obot = document.createElement('div');
			obot.classList.add('oi-bottom');
			obot.innerHTML = '<div class="oi-left"></div><div class="oi-right"></div>';
			add(obot,el);
			this.el = document.createElement('div');
			this.el.classList.add('oi-map-inner');
			this.el.style.position = "relative";
			add(this.el,holder);
		}

		this.options = {
			'clip': attr.label.clip,
			'showgrid': attr.grid.show,
			'showlabel': attr.label.show,
			'formatLabel': (typeof attr.label.format==="function" ? attr.label.format : function(txt,attr){ return txt.substr(0,3); }),
			'formatTooltip': (typeof attr.tooltip.format==="function" ? attr.tooltip.format : function(txt,attr){ return txt; }),
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
				if(typeof attr.style[s].fill==="string") this.style[s].fill = attr.style[s].fill;
				if(typeof attr.style[s]['fill-opacity']==="number") this.style[s]['fill-opacity'] = attr.style[s]['fill-opacity'];
				if(typeof attr.style[s]['font-size']==="string") this.style[s]['font-size'] = attr.style[s]['font-size'];
				if(typeof attr.style[s].stroke==="string") this.style[s].stroke = attr.style[s].stroke;
				if(typeof attr.style[s]['stroke-width']==="number") this.style[s]['stroke-width'] = attr.style[s]['stroke-width'];
				if(typeof attr.style[s]['stroke-opacity']==="number") this.style[s]['stroke-opacity'] = attr.style[s]['stroke-opacity'];
			}
		}
		
		this._origin = new Hexagon(0,0,this.mapping.layout);

		// Can load a file or a hexjson data structure
		this.load = function(file,prop,fn){
			if(typeof prop==="function" && !fn){
				fn = prop;
				prop = "";
			}
			function done(data,noload){
				_obj.setMapping(data);
				if(noload) _obj.updateColours();
				if(typeof fn==="function") fn.call(_obj,{'data':prop});
			}
			if(typeof file==="string"){
				fetch(file)
				.then(function(response){ return response.json(); })
				.then(function(data){ done(data); }.bind(this))
				.catch(function(error){
					this.log('ERROR','Unable to load '+file);
				});
			}else if(typeof file==="object"){
				// Add a slight delay so that we can return before the ready() function is fired
				setTimeout(function(){ done(file,true); },100);
			}
			return this;
		};

		this.addHexes = function(data,prop,fn){
			if(this.mapping.layout){
				if(data.layout == this.mapping.layout){
					// We want to add the hexagons and rebuild the map
					for(var r in data.hexes) this.mapping.hexes[r] = data.hexes[r];
					data = this.mapping;
				}else this.log('warn','Layout has changed so over-writing existing hexes.');
			}
			this.load(data,prop,fn);				
		};

		// We'll need to change the sizes when the window changes size
		addEvent('resize',window,{},function(event){ _obj.size(); });

		this.setHexStyle = function(r){
			var h,style,cls,p;
			h = this.areas[r];
			style = clone(this.style['default']);
			cls = "";
			if(h.active) style.fill = h.fillcolour;
			if(h.hover) h.hex.classList.add('hover');
			if(h.selected){
				for(p in this.style.selected){
					if(this.style.selected[p]) style[p] = this.style.selected[p];
				}
				cls += ' selected';
			}
			if(this.mapping.hexes[r]['class']) cls += " "+this.mapping.hexes[r]['class'];
			setAttr(h.path,style);
			return h;
		};

		this.toFront = function(r){
			var outline = this.areas[r].hex.cloneNode(true);
			if(this.areas[r] && this.areas[r].hex) add(this.areas[r].hex,hexes);
			if(outline.querySelector('text')) outline.querySelector('text').remove();
			if(outline.querySelector('title')) outline.querySelector('title').remove();
			setAttr(outline.querySelector('path'),{'fill':'none'});
			setAttr(outline.querySelector('path'),{'vector-effect':'non-scaling-stroke'});
			outline.removeAttribute('id');
			outline.classList.add('outline');
			overlay.innerHTML = "";
			add(outline,overlay);
			return this;
		};

		this.regionToggleSelected = function(r,others){
			this.selected = (this.selected==r) ? "" : r;
			var region,h;
			h = this.areas[r];
			h.selected = !h.selected;
			this.setHexStyle(r);

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
			if(hovered && hovered!=r) this.regionBlur(hovered);
			hovered = r;
			this.areas[r].hover = true;
			this.setHexStyle(r);
			this.toFront(r);
			return this;
		};

		this.regionBlur = function(r){
			this.areas[r].hex.classList.remove('hover');
			hovered = null;
			this.areas[r].hover = false;
			this.setHexStyle(r);
			return this;
		};

		this.regionActivate = function(r){
			this.areas[r].active = true;
			this.setHexStyle(r);
		};

		this.regionDeactivate = function(r){
			this.areas[r].active = false;
			this.setHexStyle(r);
		};

		this.regionToggleActive = function(r){
			this.areas[r].active = !this.areas[r].active;
			this.setHexStyle(r);
		};

		this.selectRegion = function(r){
			this.selected = r;
			for(var region in this.areas){
				if(this.areas[region]){
					if(r.length > 0 && region.indexOf(r)==0){
						this.areas[region].selected = true;
						this.setHexStyle(region);
					}else{
						this.areas[region].selected = false;
						this.setHexStyle(region);
					}
				}
			}
			return this;
		};

		this.setClass = function(fn){
			if(typeof fn==="function"){
				for(var region in this.areas){
					fn.call(this,region,this.areas[region]);
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
			if(!this.callback[type]) this.callback[type] = [];
			this.callback[type].push({ 'fn': fn, 'attr': prop });
			return this;
		};
		this.size = function(w,h){
			this.el.style.height = '';
			this.el.style.width = '';
			el.removeAttribute('style');
			w = Math.min(this.maxw,el.offsetWidth);
			this.el.style.height = (w/aspectratio)+'px';
			this.el.style.width = w+'px';
			h = Math.min(this.maxh,this.el.offsetHeight);
			
			// Create SVG container
			if(!svg){
				svg = svgEl('svg');
				setAttr(svg,{'class':'oi-map-map','xmlns':ns,'version':'1.1','overflow':'visible','viewBox':(attr.viewBox||'0 0 '+w+' '+h),'style':'max-width:100%;','preserveAspectRatio':'xMidYMin meet','vector-effect':'non-scaling-stroke'});
				add(svg,this.el);
				// Create data layer
				datalayer = svgEl('g');
				datalayer.classList.add('data-layer');
				datalayer.setAttribute('role','table');
				// Create group for hexes
				hexes = svgEl('g');
				hexes.classList.add('series');
				hexes.setAttribute('role','row');
				hexes.setAttribute('aria-label','hexagons');
				hexes.setAttribute('tabindex','0');
				// Create group for overlay
				overlay = svgEl('g');
				overlay.classList.add('overlay');
			}
			setAttr(svg,{'style':'width:'+w+'px;max-width: 100%; max-height: 100%; margin: auto; background: none;'});
			
			var scale = w/wide;
			this.properties.size = attr.size*scale;
			wide = w;
			tall = h;
			this.el.style.height = '';
			this.el.style.width = '';

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
			this.areas = {};
			if(grid) grid.remove();
			constructed = false;
			return this;
		};

		this.setMapping = function(mapping){
			this.mapping = mapping;
			if(!this.properties) this.properties = { "x": 100, "y": 100 };
			var p = mapping.layout.split("-");
			this.properties.shift = p[0];
			this.properties.orientation = p[1];

			return this.initialized();
		};

		this.estimateSize = function(){
			var s,nx,ny,dx,dy;
			if(this.properties.orientation=="r"){
				if(range.r.d == 0){
					nx = range.q.d + 1;
					ny = 1;
				}else if(range.r.d > 0){
					nx = range.q.d + 1.5;
					ny = range.r.d + 1;
				} 
				dy = (1.5*ny) + 0.5;
				dx = nx*2;
				return Math.min((2/Math.sqrt(3))*wide/dx,tall/dy);
			}else{
				if(range.q.d == 0){
					nx = 1;
					ny = range.r.d + 1;
				}else if(range.q.d > 0){
					nx = range.q.d + 1;
					ny = range.r.d + 1.5;
				}
				dx = (1.5*nx) + 0.5;
				dy = ny*2;
				return Math.min(wide/dx,(2/Math.sqrt(3))*tall/dy);
			}
			return s;
		};

		this.getEdge = function(h){
			return (new Hexagon(h.q,h.r,this.mapping.layout)).getEdge(h.e);
		};

		this.updateLabels = function(lkey,tkey){
			var r,l,t;
			for(r in this.areas){
				if(this.mapping.hexes[r]){
					this.areas[r]._lkey = lkey;
					this.areas[r]._tkey = tkey;

					if(this.areas[r].label){
						l = '';
						if(typeof lkey==="string") l = (lkey in this.mapping.hexes[r] ? this.mapping.hexes[r][lkey] : "");
						else l = this.mapping.hexes[r].n||this.mapping.hexes[r].msoa_name_hcl||"";
						this.areas[r].label.innerHTML = this.options.formatLabel(l,{'hex':this.mapping.hexes[r],'overlay':false,'size':this.properties.size,'font-size':parseFloat(getComputedStyle(this.areas[r].label)['font-size'])||this.properties.s.sin,'line-height':parseFloat(getComputedStyle(this.areas[r].label)['line-height'])});
					}
					if(this.areas[r].tooltip){
						t = '';
						if(typeof tkey==="string") t = (tkey in this.mapping.hexes[r] ? this.mapping.hexes[r][tkey] : "");
						else t =	this.mapping.hexes[r].Tooltip||this.mapping.hexes[r].tooltip||this.mapping.hexes[r].n||this.mapping.hexes[r].msoa_name_hcl||"";
						this.areas[r].tooltip.innerHTML = this.options.formatTooltip(t,{'x':this.areas[r].pos.x||null,'y':this.areas[r].pos.y||null,'hex':this.mapping.hexes[r],'size':this.properties.size,'font-size':parseFloat(this.style.default['font-size'])});
					}
				}
			}
			return this;
		};

		this.updateColours = function(fn){
			var r;
			if(typeof fn!=="function"){
				fn = function(){
					var fill = this.style['default'].fill;
					if(_obj.mapping.hexes[r].colour) fill = _obj.mapping.hexes[r].colour;					
					if(typeof attr.colours==="string") fill = attr.colours;
					return fill;
				};
			}
			for(r in this.mapping.hexes){
				if(this.mapping.hexes[r]){
					this.areas[r].fillcolour = fn.call(this,r);
					this.setHexStyle(r);
				}
			}
			return this;
		};
		
		this.updateBoundaries = function(fn){
			var props,n;
			if(typeof fn!=="function") fn = function(){ return {'stroke':'black','stroke-width':1}; };
			for(n in this.mapping.boundaries){
				props = fn.call(this,n,this.mapping.boundaries[n])||{};
				props.fill = "none";
				if(this.lines[n]) setAttr(this.lines[n],props);
			}
			return this;
		};

		this.draw = function(){			

			var events = {
				'mouseover': function(e){ if(e.data.region){ e.data.hexmap.regionFocus(e.data.region); } ev(e,'mouseover'); },
				'mouseout': function(e){ ev(e,'mouseout'); },
				'click': function(e){ if(e.data.region){ e.data.hexmap.regionFocus(e.data.region); } ev(e,'click'); }
			};

			var _obj,defs,id,r;
			_obj = this;
			defs = svgEl('defs');
			add(defs,svg);
			id = (el.getAttribute('id')||'hex');
			this.id = id;
			if(attr.patterns) defs.innerHTML += attr.patterns.join("");

			// Create hexagons
			if(this.mapping.hexes){
				add(datalayer,svg);
				add(hexes,datalayer);

				for(r in this.mapping.hexes){
					if(this.mapping.hexes[r]){
						if(!constructed){
							this.areas[r] = new Hexagon(this.mapping.hexes[r].q,this.mapping.hexes[r].r,this.mapping.layout);
							this.areas[r].set(el,this.mapping.hexes[r],this);

							add(this.areas[r].hex,hexes);

							// Attach events to our SVG group nodes
							addEvent('mouseover',this.areas[r].hex,{type:'hex',hexmap:this,region:r,data:this.mapping.hexes[r]},events.mouseover);
							addEvent('mouseout',this.areas[r].hex,{type:'hex',hexmap:this,region:r,me:this.areas[r]},events.mouseout);
							addEvent('click',this.areas[r].hex,{type:'hex',hexmap:this,region:r,me:this.areas[r],data:this.mapping.hexes[r]},events.click);
						}
						this.setHexStyle(r);
						setAttr(this.areas[r].path,{'stroke':this.style['default'].stroke,'stroke-opacity':this.style['default']['stroke-opacity'],'stroke-width':this.style['default']['stroke-width'],'style':'cursor: pointer;'});
					}
				}

				if(this.options.showgrid){
					if(!grid){
						grid = svgEl("rect");
						setAttr(grid,{'id':'grid','x':"0%",'y':"0%",'width':"100%",'height':"100%"});
						svg.prepend(grid);
					}
					setAttr(grid,{'fill':'url(#'+id+'-pattern-'+this.properties.orientation});
					this._origin.addPattern(el,this.id+'-pattern-q',"odd-q",this._origin.x,this._origin.y);
					this._origin.addPattern(el,this.id+'-pattern-r',"odd-r",this._origin.x,this._origin.y);
				}
				this.updateLabels();
			}

			// Create lines
			this.drawBoundaries();

			if(this.mapping.hexes) add(overlay,svg);

			this.fitToRange();

			constructed = true;

			return this;
		};
		
		this.fitToRange = function(){

			var dx,dy,w,h,extent,r;
			extent = new Extent();
			for(r in this.areas) extent.extend(this.areas[r]);

			dx = extent.x.max - extent.x.min;
			dy = extent.y.max - extent.y.min;
			w = dx;
			h = dy;
			if(h > w/aspectratio){
				w = h*aspectratio;
				extent.x.min -= (w-dx)/2;
				extent.x.max -= (w-dx)/2;
				extent.y.min -= (h-dy)/2;
				extent.y.max -= (h-dy)/2;
			}

			setAttr(svg,{'viewBox':extent.x.min.toFixed(2)+' '+extent.y.min.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)});

			if(grid) setAttr(grid,{'id':'grid','x':extent.x.min.toFixed(2),'y':extent.y.min.toFixed(2)});

			return this;
		};
		
		this.drawBoundaries = function(){
			if(this.mapping.boundaries){
				if(!lines){
					lines = svgEl('g');
					lines.classList.add('lines');
				}

				lines.innerHTML = "";
				var n,s,d,boundaries,prevedge,edge,join;
				this.lines = {};
				boundaries = this.mapping.boundaries;
				for(n in boundaries){
					d = "";
					prevedge = null;
					// Do we have edges?
					if(boundaries[n].edges){
						for(s = 0; s < boundaries[n].edges.length; s++){
							edge = this.getEdge(boundaries[n].edges[s]);
							if(edge){
								join = (prevedge && (edge[0]==prevedge[4] && edge[1]==prevedge[5])) ? '' : 'M';
								if(join) d += join+edge[0]+' '+edge[1];
								if(edge[2]==0) d += 'v'+roundTo(edge[3],2);
								else if(edge[3]==0) d += 'h'+roundTo(edge[2],2);
								else d += 'l'+roundTo(edge[2],2)+' '+roundTo(edge[3],2);
								prevedge = edge;
							}
						}
					}
					if(d){
						this.lines[n] = svgEl('path');
						setAttr(this.lines[n],{'d':d,'data-name':n,'vector-effect':'non-scaling-stroke'});
						add(this.lines[n],lines);
					}
				}
				add(lines,svg);
				this.updateBoundaries();
			}
			return this;
		};

		this.size();
		if(attr.hexjson) this.load(attr.hexjson,attr.ready);

		return this;
	}

	function Hexagon(q,r,layout){
		if(!layout) layout = "odd-r";
		var _side,_sep,_short,_hexpath,_half;
		_side = 60;	// The length of a hexagon side
		_half = _side/2;
		_sep = _side*1.5;
		_short = parseFloat(Math.round(_side*Math.cos(Math.PI/6)).toFixed(1));
		if(layout.indexOf('-r')>0) _hexpath = 'm0-'+_side+'l'+_short+','+_half+',0,'+_side+',-'+_short+','+_half+',-'+_short+'-'+_half+',0-'+_side+','+_short+'-'+_half+'z';
		else _hexpath = 'm'+_half+'-'+_short+'l'+_half+' '+_short+',-'+_half+' '+_short+',-'+_side+' 0,-'+_half+' -'+_short+','+_half+' -'+_short+','+_side+' 0z';
		this.set = function(el,attr,hexmap){
			var label,defs,g,path,tt,p;
			defs = el.querySelector('svg defs');
			q = attr.q;
			r = attr.r;
			g = svgEl('g');
			g.classList.add('hex');
			if(attr.class) g.classList.add(...attr.class.split(' '));
			setAttr(g,{'role':'cell','data-q':q,'data-r':r,'aria-label':(attr.name||attr.n)});

			path = svgEl('path');
			add(path,g);
			setAttr(path,{'d':_hexpath,'vector-effect':'non-scaling-stroke'});

			tt = svgEl('title');
			tt.innerHTML = (attr.name||attr.n);
			add(tt,path);

			p = this.getXY();
			this.pos = p;
			setAttr(g,{'transform':'translate('+p.x+' '+p.y+')'});

			this.hex = g;
			this.path = path;
			this.selected = false;
			this.active = true;
			this.data = attr;
			this._extent = (layout.indexOf('-r') > 0) ? {'x':{'min':p.x-_short,'max':p.x+_short},'y':{'min':p.y-_side,'max':p.y+_side}} : {'x':{'min':p.x-_side,'max':p.x+_side},'y':{'min':p.y-_short,'max':p.y+_short}};

			setAttr(path,{'stroke':hexmap.style['default'].stroke,'stroke-opacity':hexmap.style['default']['stroke-opacity'],'stroke-width':hexmap.style['default']['stroke-width'],'style':'cursor: pointer;'});

			if(hexmap.options.showlabel){
				if(hexmap.style['default']['font-size'] >= hexmap.options.minFontSize){
					label = svgEl('text');
					// Add to DOM
					add(label,g);
					setAttr(label,{'dominant-baseline':'central','data-q':attr.q,'data-r':attr.r,'class':'hex-label','text-anchor':'middle','font-size':_half+'px','title':(attr.n || r)});
					if(hexmap.options.clip){
						var clipid = (el.getAttribute('id')||'hex')+'-clip-'+r;
						var clip = document.getElementById(clipid);
						if(!clip){
							clip = svgEl('clipPath');
							clip.id = clipid;
						}else{
							clip.innerHTML = "";
						}
						var hexclip = path.cloneNode(true);
						clip.classList.add('hover');
						add(hexclip,clip);
						add(clip,defs);	
						this.clip = clip;
						setAttr(label,{'clip-path':'url(#'+clipid+')'});
					}
					this.label = label;
					this.tooltip = tt;
				}
			}

			return this;
		};
		this.getXY = function(){
			var x,y;
			if(layout=="odd-r"){
				x = q*_short*2 + (r&1==1 ? _short : 0);
				y = -r*_sep;
			}else if(layout=="even-r"){
				x = q*_short*2 + (r&1==1 ? -_short : 0);
				y = -r*_sep;
			}else if(layout=="odd-q"){
				x = q*_sep;
				y = -(r*_short*2 + (q&1==1 ? _short : 0));
			}else if(layout=="even-q"){
				x = q*_sep;
				y = -(r*_short*2 + (q&1==1 ? -_short : 0));
			}
			return {x:x,y:y};
		};
		this.getEdge = function(edge){
			var x,y,p,edges,positive,e,ed,cs,ss;

			ed = Math.abs(edge);
			positive = (edge >= 0);

			if(typeof ed==="number" && ed >= 1 && ed <= 6){

				// Get centre of the hexagon
				p = this.getXY();
				x = p.x;
				y = p.y;
				cs = _short;
				ss = _half;
				if(layout.indexOf("-r") > 0){
					// Pointy-topped hex edges
					edges = [
						[x,(y-2*ss),cs,ss],
						[(x+cs),(y-ss),0,(2*ss)],
						[(x+cs),(y+ss),-cs,ss],
						[x,(y+2*ss),-cs,-ss],
						[(x-cs),(y+ss),0,(-2*ss)],
						[(x-cs),(y-ss),cs,-ss]
					];
				}else{
					// Flat-topped hex edges
					edges = [
						[(x-ss),(y-cs),(2*ss),0],
						[(x+ss),y-cs,ss,cs],
						[(x+2*ss),y,-ss,cs],
						[(x+ss),(y+cs),(-2*ss),0],
						[(x-ss),y+cs,-ss,-cs],
						[(x-2*ss),y,ss,-cs]
					];
				}
				e = edges[ed-1];
				e[4] = e[0]+e[2];
				e[5] = e[1]+e[3];
				if(!positive) e = [e[4],e[5],-e[2],-e[3],e[0],e[1]];
				// Round numbers to avoid floating point uncertainty
				e[0] = roundTo(e[0],3);
				e[1] = roundTo(e[1],3);
				e[4] = roundTo(e[4],3);
				e[5] = roundTo(e[5],3);
				return e;
			}
			return null;
		};
		this.getPath = function(){ return _hexpath; };
		this.addPattern = function(el,id,lay,x,y){
			var defs = el.querySelector('defs');
			var p = document.getElementById(id);
			if(!p){
				p = svgEl("pattern");
				setAttr(p,{'id':id,'patternUnits':'userSpaceOnUse'});
			}
			if(lay.indexOf('-r')>0){
				setAttr(p,{'width':(_short*2),'height':(_side*3),'x':x,'y':y});
				p.innerHTML = '<path stroke="#cbd5e1" stroke-width="0.7" d="M'+_short+' '+(_side/2)+'v-'+(_side/2)+'m0 '+(_side/2)+'l'+_short+' '+(_side/2)+'v'+_side+'l-'+_short+' '+(_side/2)+'v'+(_side/2)+'m0 -'+(_side/2)+'l-'+_short+' -'+(_side/2)+' v-'+_side+'l'+_short+' -'+(_side/2)+'" fill="none"	vector-effect="non-scaling-stroke" />';
			}else{
				setAttr(p,{'width':(_side*3),'height':(_short*2),'x':x,'y':y});
				p.innerHTML = '<path stroke="#cbd5e1" stroke-width="0.7" d="M'+(_side*2)+' 0H'+_side+'L'+(_side/2)+' '+_short+'l'+(_side/2)+' '+_short+'h'+_side+'l'+(_side/2)+'-'+_short+'zM150 '+_short+'h'+(_side/2)+'M0 '+_short+'h'+(_side/2)+'" fill="none"	vector-effect="non-scaling-stroke" />';
			}
			add(p,defs);
			return this;
		};
		return this;
	}

	function Extent(){
		this.x = {'min':Infinity,'max':-Infinity};
		this.y = {'min':Infinity,'max':-Infinity};
		this.extend = function(h){
			this.x.min = Math.min(this.x.min,h._extent.x.min);
			this.x.max = Math.max(this.x.max,h._extent.x.max);
			this.y.min = Math.min(this.y.min,h._extent.y.min);
			this.y.max = Math.max(this.y.max,h._extent.y.max);
			return this;
		};
		return this;
	}

	function Log(opt){
		// Console logging version 2.0
		if(!opt) opt = {};
		if(!opt.title) opt.title = "Log";
		if(!opt.version) opt.version = "2.0";
		this.message = function(...args){
			var t = args.shift();
			if(typeof t!=="string") t = "log";
			var ext = ['%c'+opt.title+' '+opt.version+'%c'];
			if(args.length > 0){
				ext[0] += ':';
				if(typeof args[0]==="string") ext[0] += ' '+args.shift();
			}
			ext.push('font-weight:bold;');
			ext.push('');
			if(args.length > 0) ext = ext.concat(args);
			console[t].apply(null,ext);
		};
		return this;
	}

	// Helper functions
	var ns = 'http://www.w3.org/2000/svg';
	function add(el,to){ return to.appendChild(el); }
	function clone(a){ return JSON.parse(JSON.stringify(a)); }
	function setAttr(el,prop){
		for(var p in prop){
			if(typeof prop[p]!=="undefined") el.setAttribute(p,prop[p]);
		}
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
	function ev(e,t){
		var rtn = [];
		if(e.data.hexmap.callback[t]){
			for(var c = 0; c < e.data.hexmap.callback[t].length; c++){
				for(var a in e.data.hexmap.callback[t][c].attr){
					if(e.data.hexmap.callback[t][c].attr[a]) e.data[a] = e.data.hexmap.callback[t][c].attr[a];
				}
				if(typeof e.data.hexmap.callback[t][c].fn==="function") rtn.push(e.data.hexmap.callback[t][c].fn.call(e.data['this']||this,e));
			}
		}
		return rtn||false;
	}
	function roundTo(v,prec){
		if(typeof v==="number") v = v.toFixed(prec);
		return v.replace(/\.([0-9]+)0+$/,function(m,p1){ return "."+p1; }).replace(/\.0+$/,"");
	}

	OI.hexmap = HexMap;
	root.OI = OI;
})(window || this);
