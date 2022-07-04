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
		
		let init = `const node=document.importNode(this.template, true)
this.$root=node`
		for (let node of content.querySelectorAll("[\\$]")) {
			let path = get_path(root, node)
			let id = node.getAttribute('$')
			node.removeAttribute('$')
			init += `
this.$${id} = node${path}`
		}
		let c = new Function(init)
		c.prototype = {template: root}
		return c
	}
}

let row_template = HTML`<tr><td data-type=rom id=rom><td>+<td data-type=patch id=patch><td onclick=apply_row(this.parentNode) class=ack>→<td data-type=out id=out>`

class File {
	constructor(thing) {
		this.$elem = document.createElement('file-label')
		File.elems.set(this.$elem, this)
		this.$elem.draggable = true
		// zip entry
		if ('compressedSize' in thing) {
			this.name = thing.filename
			this.size = thing.uncompressedSize
			this.crc = thing.crc32
			this.ze = thing
			let p
			this.ready = x=>{
				let p = new Promise((y,n)=>{
					console.log('reading zip entry')
					this.ze.getData(new zip.BlobWriter(), blob=>{
						blob.name = "file.heck"
						if (blob.size==0)
							Object.defineProperty(blob, 'size', {value:'0',configurable:true})
						this.mf = new MarcFile(blob, y, n)
					}, null, n)
				})
				this.ready = x=>p
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
				let p = new Promise((y,n)=>{
					this.mf = new MarcFile(thing, e=>{
						this.crc = crc32(this.mf)
						this.draw_crc()
						y()
					}, n)
				})
				this.ready = x=>p
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
	draw_crc() {
		if (this.crc)
			this.$crc.textContent = ("00000000"+this.crc.toString(16)).slice(-8).replace(/..(?!$)/g, "$& ")
	}
	clone(type) {
		let f = Object.create(File.prototype, Object.getOwnPropertyDescriptors(this))
		f.$elem = document.createElement('file-label')
		File.elems.set(f.$elem, f)
		f.type = type
		f.$elem.draggable = true
		f.draw()
		return f
	}
	draw() {
		let cell = this.$elem
		cell.textContent = ""
		this.$elem.dataset.type = this.type
		let lbl = document.createElement('span')
		lbl.textContent = this.name
		lbl.className = 'filename'
		let btn = document.createElement('button')
		btn.textContent = "×"
		cell.append(btn, lbl)
		let e = document.createElement('div')
		let a = document.createElement('span')
		if (this.size>1000)
			a.textContent = (this.size/1024).toFixed(1)+" KB"
		else
			a.textContent = this.size+" B"
		let b = document.createElement('span')
		this.$crc = b
		this.draw_crc()
		e.append(btn, a,b)
		e.className = 'crc'
		cell.append(e)
		
		btn.onclick = e=>{this.delete()}
	}
	delete() {
		this.mf = this.ze = null
		//File.elems.remove(this.$elem)
		this.$elem.remove()
		this.$elem = null
		clean_rows($item_list)
	}
	look(tbody, other, test1, test2) {
		let patches = [...tbody.querySelectorAll(`:scope > tr > td[data-type="${other}"] > file-label`)].map(e=>File.of(e))
		let p = patches.find(test1) || patches.find(test2)
		let row
		if (p) {
			row = p.$elem.parentNode.parentNode
		} else {
			for (let r of tbody.rows) {
				if (!r.querySelector('file-label'))
					row = r
			}
			row = row || add_row(tbody)
		}
		let cell = row.querySelector(`td[data-type="${this.type}"]`)
		cell.replaceChildren(this.$elem)
		clean_rows($item_list)
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
}
File.elems = new WeakMap()
