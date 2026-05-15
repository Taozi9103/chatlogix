from dotenv import load_dotenv
import os
load_dotenv()
import pymysql

conn = pymysql.connect(host='127.0.0.1', port=3306, user='root', password='123456', database='chatlogix', charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=True)
cur = conn.cursor()
cur.execute('SELECT id, username, password FROM users WHERE username = %s', ('test',))
rows = cur.fetchall()
conn.close()

stored = rows[0]['password']
print('stored hash:', repr(stored))

import bcrypt
try:
    result = bcrypt.checkpw(b'123456', stored.encode('utf-8'))
    print('Result:', result)
except Exception as e:
    print('Error:', e)
    # Let's see the raw bytes
    print('Bytes:', stored.encode('utf-8'))
