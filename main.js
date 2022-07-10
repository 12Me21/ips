function NO_CONVERT(type) {
	let x = new TypeError("🚮 invalid type conversion", this, "⛔ to "+type)
	x.stack = x.stack.replace(/^(?!Error:).*\n/, "")
	throw x
}
Object.prototype[Symbol.toPrimitive] = NO_CONVERT
Error.prototype[Symbol.toPrimitive] = function() {
	return this.toString()+"\n"+this.stack
}

{
	let get_path = (root, node)=>{
		let path = ""
		while (node!==root) {
			let parent = node.parentNode
			let pos = [].indexOf.call(parent.childNodes, node)
			path = ".firstChild"+".nextSibling".repeat(pos) + path
			node = parent
		}
		return path
	}
	
	window.HTML = ([html])=>{
		let temp = document.createElement('template')
		temp.innerHTML = html.replace(/\s*?\n\s*/g, "")
		let content = temp.content
		let root = content
		if (root.childNodes.length==1)
			root = root.firstChild
		
		let init = `const node=document.importNode(this, true)
holder.$root=node`
		for (let node of content.querySelectorAll("[\\$]")) {
			let path = get_path(root, node)
			let id = node.getAttribute('$')
			node.removeAttribute('$')
			init += `
holder.$${id} = node${path}`
		}
		init += `
return holder`
		let c = new Function('holder={__proto__:null}', init).bind(root)
		//c.prototype = {template: root}
		return c
	}
}

let row_template = HTML`
<tr>
	<td data-type=rom id=$rom>
	<td>+
	<td data-type=patch id=$patch>
	<td onclick=apply_row(this.parentNode) class=ack>→
	<td data-type=out id=$out>
`

let label_template = HTML`
<file-label draggable=true>
	<div>
		<span $=name class='filename'></span>
		<span $=status></span>
	</div>
	<div class=info>
		<button $=delete>×</button>
		<span $=size></span>
		<span $=crc class=crc></span>
	</div>
</file-label>`

class File {
	constructor(thing) {
		label_template(this)
		this.register()
		// ZipObject
		if ('dosPermissions' in thing) {
			this.name = thing.unsafeOriginalName
			this.size = thing._data.uncompressedSize
			this.crc = thing._data.crc32
			if (this.crc<0)
				this.crc += 2**32
			this.ze = thing
			let p
			this.ready = x=>{
				this.status = "loading"
				let p = new Promise((y,n)=>{
					this.ze.async('arraybuffer').then(ab=>{
						this.mf = new MarcFile(ab)
						this.check_valid() ? y() : n('invalid file')
					})
				})
				this.ready = x=>p
				p.then(x=>{
					this.status = ""
				}, x=>{
					this.status = "error"
				})
				return p
			}
		}
		// MarcFile
		else if (thing.fileName) {
			this.name = thing.fileName
			this.size = thing.fileSize
			this.crc = crc32(thing)
			this.mf = thing
			this.ready = x=>true
		}
		// Blob
		else {
			this.name = thing.name
			this.size = thing.size
			this.crc = null
			this.status = "loading"
			let p = new Promise((y,n)=>{
				this.mf = new MarcFile(thing, e=>{
					this.crc = crc32(this.mf)
					this.draw_crc()
					this.check_valid() ? y() : n('invalid file')
				}, n)
			})
			p.then(x=>{
				this.status = ""
			}, x=>{
				this.status = "error"
			})
			this.ready = ()=>p
		}
		
		let [, path, base_name, ext] = /^([^]*[/])?([^/]*?)(\.[^./]+)?$/i.exec(this.name)
		this.path = path || ""
		this.base = base_name
		this.ext = ext
		if (ext && ext.toLowerCase()=='.ips') {
			this.type = 'patch'
		} else {
			this.type = 'rom'
		}
		if (thing.fileName)
			this.type = 'out'
		this.draw()
	}
	register() {
		File.elems.set(this.$root, this)
	}
	// after ready
	check_valid() {
		if (this.type=='patch') {
			let p = this.mf
			p.seek(0)
			if (String.fromCharCode.apply(String, p.readBytes(5)) != IPS_MAGIC) {
				this.invalid = true
				this.$root.classList.add('invalid')
				return false
			}
		}
		return true
	}
	draw_crc() {
		if (this.crc)
			this.$crc.textContent = ("00000000"+this.crc.toString(16)).slice(-8).replace(/..(?!$)/g, "$& ")
	}
	clone(type) {
		let base = this
		// if `this` is already a clone, we clone the original instead
		if (base.__proto__ instanceof File)
			base = base.__proto__
		// clone
		let b = label_template({type: type})
		b.__proto__ = this
		// ok
		b.register()
		b.draw()
		return b
	}
	draw() {
		this.$root.dataset.type = this.type
		this.$name.textContent = this.name
		if (this.size>1000)
			this.$size.textContent = (this.size/1024).toFixed(1)+" KB"
		else
			this.$size.textContent = this.size+" B"
		this.draw_crc()
		this.$delete.onclick = ev=>{this.delete()}
	}
	delete() {
		this.mf = this.ze = null
		//File.elems.remove(this.$root)
		this.$root.remove()
		this.$root = null
		clean_rows($item_list)
	}
	set status(t) {
		this.$status.textContent = t || ""
	}
	look(tbody, other, test) {
		let patches = [...tbody.querySelectorAll(`td[data-type="${other}"] > file-label`)].map(e=>File.of(e))
		let matches = patches.map(p=>[test(p),p]).filter(x=>x[0])
		let p = matches.sort((a,b)=>a[0]-b[0])[0]
		let row
		if (p) {
			row = p[1].$root.parentNode.parentNode
		} else {
			for (let r of tbody.rows) {
				if (!r.querySelector('file-label'))
					row = r
			}
			row = row || add_row(tbody)
		}
		let cell = row.querySelector(`td[data-type="${this.type}"]`)
		cell.replaceChildren(this.$root)
		clean_rows($item_list)
	}
	
	put(cell) {
		cell.replaceChildren(this.$root)
	}
	insert(tbody) {
		if (this.type=='rom')
			this.look(tbody, 'patch', p=>File.compare_names(this, p))
		else
			this.look(tbody, 'rom', p=>File.compare_names(p, this))
	}
	static compare_names(rom, patch) {
		let pp = patch.path+patch.base
		// path/name.ext - path/name.ext.ips
		if (rom.name == pp) return 10
		// path/name.ext - path/name.ips
		if (rom.path+rom.base == pp) return 6
		// path/name.ext - name.ext.ips
		if (rom.base+rom.ext == pp) return 9
		// path/name.ext - name.ips
		if (rom.base == pp) return 5
		// name.ext - name.ext.ips
		if (rom.base+rom.ext == patch.base) return 8
		// name.ext - name.ips
		if (rom.base == patch.base) return 4
	}
	static of(elem) {
		return this.elems.get(elem)
	}
	static get_out_files(tbody) {
		let files = []
		for (let row of tbody.rows) {
			let $out = row.cells.$out
			let f = $out.firstChild
			if (f)
				files.push(this.of(f))
		}
		return files
	}
	static get_row_files(row) {
		let {$rom, $patch} = row.cells
		return {
			rom: File.of($rom.firstChild),
			patch: File.of($patch.firstChild),
		}
	}
}
File.elems = new WeakMap()

MarcFile.prototype.blob = function() {
	let blob
	window.saveAs = x=>{blob = x}
	this.save()
	return blob
}

async function write_zip(files) {
	let zip = new JSZip()
	for (let f of files) {
		await f.ready()
		f.status = "storing"
	}
	for (let f of files) {
		f.status = ""
	}
	return await zip.generateAsync({type: 'blob'})
}
