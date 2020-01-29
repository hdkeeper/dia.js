const  Dia          = require ('../../Dia.js')
const  readline     = require ('readline')
const {Transform}   = require ('stream')

module.exports = class extends Dia.DB.Client {
    
    async release (success) {   
    }
    
    to_limited_sql_params (original_sql, original_params, limit, offset) {
        let params = original_params.slice ()
        params.push (limit)
        params.push (offset)
        return [original_sql + ' LIMIT ? OFFSET ?', params]
    }
    
    log_label (sql, params) {
    
    	return (this.log_prefix || '') + sql
    
    }
    
    async select_loop (sql, params, callback, data) {
    	
    	sql = this.bind (sql, params)
    	
    	let label = this.log_label (sql)
        
        try {
        
        	console.time (label)        

        	let input = await this.backend.responseStream ({}, sql + ' FORMAT JSONEachRow')

        	return new Promise ((ok, fail) => {

				readline.createInterface ({input})
					.on ('line', s => callback (JSON.parse (s), data))
					.on ('close', () => ok (data))
        	
        	})

        }
        finally {        
        
        	console.timeEnd (label)        
        	
        }

    }

    async get (def) {
        let q =  this.query (def)
        let [limited_sql, limited_params] = this.to_limited_sql_params (q.sql, q.params, 1)
        let getter = q.parts [0].cols.length == 1 ? this.select_scalar : this.select_hash
        return getter.call (this, q.sql, q.params)
    }

    carp_write_only () {
    	throw new Error ('Data modification not supported')
    }
    
    async upsert () {
    	this.carp_write_only ()
    }
    
    async update () {
    	this.carp_write_only ()
    }
    
    async delete () {
    	this.carp_write_only ()
    }

    async insert (table, data) {
    
        let def = this.model.tables [table]; if (!def) throw 'Table not found: ' + table

        if (!Array.isArray (data)) data = [data]; if (data.length == 0) return

        let fields = Object.keys (data [0]).filter (k => def.columns [k]); if (!fields.length) throw 'No known values provided to insert in ' + table + ': ' + JSON.stringify (data)
      
    	let sql = `INSERT INTO ${table} (${fields}) FORMAT JSONEachRow\n`
    	
    	let label = this.log_label (sql)
       
        try {        
        
        	console.time (label)        
        	
        	let body = new Transform ({
        	
				transform (chunk, encoding, callback) {
				
					if (sql) {
					
						this.push (sql)
						
						sql = null
					
					}
				
					this.push (chunk)
					
					callback ()			
					
				}        	
				
			})
        	
			let res_promise = this.backend.response ({}, body)
			
			for (let r of data) {

				let d = {}; for (let k of fields) d [k] = r [k]
				
				body.write (JSON.stringify (d) + '\n')

			}
			
			body.end ()
			
			await res_promise

        }
        finally {
        
        	console.timeEnd (label)
        
        }


    }

    is_auto_commit () {
    	return true
    }
    
    async begin () {
    }
    
    async commit () {
    }
    
    async rollback () {
    }

    bind (original_sql, params) {
    	if (!params.length) return original_sql
		let [sql, ...parts] = original_sql.split ('?')
        let esc = s => "'" + s.replace (/[\\']/g, s => "\\" + s) + "'"
        for (let part of parts) sql += `${esc (params.shift ())}${part}`        
        return sql    
    }
    
    async do (sql, params = []) {
    
    	sql = this.bind (sql, params)
    	
    	let label = this.log_label (sql)
        
        try {        
        	console.time (label)        
			await this.backend.response ({}, sql)			
        }
        finally {
        
        	console.timeEnd (label)
        
        }
    
    }        

    async select_all (sql, params = []) {
    
    	return this.select_loop (sql, params, (d, a) => a.push (d), [])

    }
    
    async select_hash (sql, params = []) {

		let [h] = await this.select_all (sql, params)
		
		return h || {}

    }
    
    async load_schema_tables () {
    
        let tables = this.model.tables

		let rs = await this.select_all ("SELECT * FROM system.tables WHERE database=?", [this.database])

        for (let r of rs) {
            let t = tables [r.name]
            if (!t) continue
            r.columns = {}
            r.keys = {}
            t.existing = r
        }

    }
    
    async load_schema_table_columns () {
    
		let rs = await this.select_all ("SELECT * FROM system.columns WHERE database=?", [this.database])

        let tables = this.model.tables
        
        for (let r of rs) {

            let t = tables [r.table]            
            if (!t) continue
            
            let {name} = r
            
			let col = {
				name,
				TYPE_NAME: r.type,
				REMARK: r.comment,
			}
			
			if (r.default_kind == 'DEFAULT') col.COLUMN_DEF = r.default_expression

			t.existing.columns [name] = col
            
        }    
        
    }
    
    async load_schema_table_keys () { }

    async load_schema_table_triggers () { }

}