# Use an official Node.js image as base
FROM node:18

# Set the working directory
WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy Python requirements and install Python dependencies
COPY requirements.txt ./
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip3 install -r requirements.txt

# Copy the rest of your project
COPY . .

# Start both Node.js and Python processes
CMD ["sh", "-c", "node server.js & python3 script.py"]
