// [column, type, flag]  flag: pk | fk:<table> | enc | ''
const TABLES = [
  ['medical_ids', '001', [['user_id', 'uuid', 'pk fk:users'], ['iv', 'text b64', 'enc'], ['tag', 'text b64', 'enc'], ['ciphertext', 'text b64', 'enc'], ['updated_at', 'timestamptz', '']]],
  ['users', '001+002', [['id', 'uuid', 'pk'], ['email', 'text unique', ''], ['password_hash', 'bcrypt', ''], ['role', 'user | responder', ''], ['settings', 'jsonb', ''], ['mfa_secret', 'jsonb {iv,tag,ct}', 'enc'], ['mfa_last_step', 'bigint', ''], ['token_version', 'int', '']]],
  ['contacts', '001', [['id', 'uuid', 'pk'], ['user_id', 'uuid', 'fk:users'], ['name, phone', 'text', ''], ['relation', 'text', ''], ['is_primary', 'bool', '']]],
  ['share_tokens', '001', [['token', 'text', 'pk'], ['user_id', 'uuid', 'fk:users'], ['expires_at', '+24 h', '']]],
  ['incident_events', '001', [['id', 'uuid', 'pk'], ['incident_id', 'uuid', 'fk:incidents'], ['type', 'text', ''], ['message', 'text', ''], ['data', 'jsonb', ''], ['created_at', 'clock_timestamp()', '']]],
  ['incidents', '001', [['id', 'uuid', 'pk'], ['user_id', 'uuid', 'fk:users'], ['trigger · status', 'check enums', ''], ['severity', 'check enum', ''], ['lat, lng, accuracy', 'float8', ''], ['triage', 'jsonb', ''], ['impact_score', 'jsonb', ''], ['medical_snapshot', 'jsonb', ''], ['contacts_snapshot', 'jsonb', ''], ['drone_id', 'text', 'fk:drones'], ['responder_id', 'uuid', 'fk:users'], ['responder_eta_minutes', 'int', '']]],
  ['drones', '001', [['id', 'text', 'pk'], ['status', 'idle…returning', ''], ['lat, lng', 'float8', ''], ['base_lat, base_lng', 'float8', ''], ['battery_pct', 'float8', ''], ['incident_id', 'uuid', ''], ['eta_seconds', 'int', '']]],
  ['hazards', '001', [['id', 'uuid', 'pk'], ['type · severity', 'check enums', ''], ['lat, lng, radius_m', '', ''], ['source', 'open-meteo | seed | user', ''], ['seed_key', 'text unique', ''], ['user_id', 'uuid', 'fk:users'], ['expires_at', 'timestamptz', '']]],
  ['mfa_recovery_codes', '002', [['id', 'uuid', 'pk'], ['user_id', 'uuid', 'fk:users'], ['code_hash', 'HMAC-SHA256', ''], ['used_at', 'timestamptz', '']]],
  ['audit_log', '002', [['id', 'uuid', 'pk'], ['user_id', 'uuid', 'fk:users'], ['actor_id', 'uuid', 'fk:users'], ['action', 'text', ''], ['meta', 'jsonb', ''], ['ip', 'text', '']]],
];

export default function schema(host) {
  host.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'schema-grid';
  host.appendChild(grid);
  TABLES.forEach(([name, mig, cols]) => {
    const card = document.createElement('div');
    card.className = 'tbl-card';
    card.innerHTML = `<h5>${name}<span>${mig}</span></h5>`;
    const ul = document.createElement('ul');
    cols.forEach(([c, t, flag]) => {
      const li = document.createElement('li');
      const cls = [];
      if (flag.includes('pk')) cls.push('pk');
      if (flag.includes('fk:')) cls.push('fk');
      if (flag.includes('enc')) cls.push('enc');
      li.className = cls.join(' ');
      const fkTarget = (flag.match(/fk:(\w+)/) || [])[1];
      li.innerHTML = `<span>${flag.includes('pk') ? '# ' : ''}${c}</span><i>${fkTarget ? '→ ' + fkTarget : t}</i>`;
      ul.appendChild(li);
    });
    card.appendChild(ul);
    grid.appendChild(card);
  });

}
