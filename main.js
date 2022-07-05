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
		File.elems.set(this.$root, this)
		this.$root.draggable = true
		// zip entry
		if ('compressedSize' in thing) {
			this.name = thing.filename
			this.size = thing.uncompressedSize
			this.crc = thing.crc32
			this.ze = thing
			let p
			this.ready = x=>{
				this.$status.textContent = "loading"
				let p = new Promise((y,n)=>{
					console.log('reading zip entry')
					this.ze.getData(new zip.BlobWriter(), blob=>{
						blob.name = "file.heck"
						if (blob.size==0)
							Object.defineProperty(blob, 'size', {value:'0',configurable:true})
						this.mf = new MarcFile(blob, x=>{
							this.check_valid() ? y() : n('invalid file')
						}, n)
					}, null, n)
				})
				this.ready = x=>p
				p.then(x=>{
					this.$status.textContent = ""
				}, x=>{
					this.$status.textContent = "error"
				})
				return p
			}
		}
		// marcfile
		else if (thing.fileName) {
			this.name = thing.fileName
			this.size = thing.fileSize
			this.crc = crc32(thing)
			this.mf = thing
			this.ready = x=>true
		}
		// real file
		else {
			this.name = thing.name
			this.size = thing.size
			this.crc = null
			this.ready = x=>{
				this.$status.textContent = "loading"
				let p = new Promise((y,n)=>{
					this.mf = new MarcFile(thing, e=>{
						this.crc = crc32(this.mf)
						this.draw_crc()
						this.check_valid() ? y() : n('invalid file')
					}, n)
				})
				this.ready = x=>p
				p.then(x=>{
					this.$status.textContent = ""
				}, x=>{
					this.$status.textContent = "error"
				})
				return p
			}
			this.ready()
		}
		let [, base_name, ext] = /^([^]*?)(\.[^.]+)?$/i.exec(this.name)
		this.base = base_name
		if (ext && ext.toLowerCase()=='.ips') {
			this.type = 'patch'
		} else {
			this.type = 'rom'
		}
		if (thing.fileName)
			this.type = 'out'
		this.draw()
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
		let f = Object.create(File.prototype, Object.getOwnPropertyDescriptors(this))
		label_template(f)
		File.elems.set(f.$root, f)
		f.type = type
		f.draw()
		return f
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
	look(tbody, other, test1, test2) {
		let patches = [...tbody.querySelectorAll(`:scope > tr > td[data-type="${other}"] > file-label`)].map(e=>File.of(e))
		let p = patches.find(test1) || patches.find(test2)
		let row
		if (p) {
			row = p.$root.parentNode.parentNode
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
		if (this.type=='rom') {
			this.look(tbody, 'patch', p=>p.base==this.name, p=>p.base==this.base)
		} else {
			this.look(tbody, 'rom', p=>p.name==this.base, p=>p.base==this.base)
		}
	}
	
	static of(elem) {
		return this.elems.get(elem)
	}
	static get_out_files(tbody) {
		let files = []
		for (let {$out} of tbody.rows) {
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
