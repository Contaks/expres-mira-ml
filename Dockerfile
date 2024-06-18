# Menggunakan image dasar Node.js
FROM node:20

RUN mkdir -p /usr/src/app/server/temp

# Menentukan direktori kerja di dalam container
WORKDIR /usr/src/app

# Menyalin file package.json dan package-lock.json ke direktori kerja
COPY package*.json ./

# Menginstal dependencies
RUN npm install

# Menyalin semua file kode ke direktori kerja
COPY . .

# Mengekspos port yang akan digunakan oleh aplikasi
EXPOSE 9000


# Menjalankan aplikasi
CMD ["npm", "start"]