# Gunakan image dasar Node.js
FROM node:16

# Set working directory di dalam container
WORKDIR /usr/src/app

# Copy file package.json dan package-lock.json ke dalam container
COPY package*.json ./

# Install dependencies aplikasi
RUN npm install

# Copy seluruh kode aplikasi ke dalam container
COPY . .

# Set environment variable untuk aplikasi
ENV NODE_ENV=production
ENV PORT=8080

# Jalankan aplikasi saat container dijalankan
CMD ["npm", "start"]

# Expose port 8080
EXPOSE 8080
