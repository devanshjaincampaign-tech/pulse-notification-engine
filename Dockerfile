# Use a slim, current LTS Node image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy only dependency manifests first — enables Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies (this layer only reruns if package.json/lock changes)
RUN npm install

# Now copy the rest of the source code
COPY . .

# Document which port the app listens on (informational — doesn't publish it)
EXPOSE 3000

# Default command to start the app
CMD ["node", "src/server.js"]