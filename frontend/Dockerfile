# Use PHP with Apache as the base image
FROM php:8.2-apache

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # PHP extensions
    libzip-dev \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    # Python and OCR tools
    python3 \
    python3-venv \
    python3-pip \
    tesseract-ocr \
    poppler-utils \
    libtesseract-dev \
    # For OpenCV and other image processing
    libsm6 \
    libxext6 \
    libxrender-dev \
    # Node.js installation requirements
    curl \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
    gd \
    mysqli \
    pdo \
    pdo_mysql \
    zip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS version)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest
# Configure Apache to proxy /api/* to Node.js
RUN a2enmod proxy proxy_http rewrite
COPY apache.conf /etc/apache2/sites-available/000-default.conf
# Create and activate Python virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application files
COPY . /var/www/html/

# Set working directory
WORKDIR /var/www/html

# Install Python dependencies
RUN if [ -f "requirements.txt" ]; then \
    pip install --no-cache-dir -r requirements.txt; \
    else echo "No requirements.txt found"; fi

# Install Node.js dependencies (if package.json exists)
RUN if [ -f "package.json" ]; then \
    npm install; \
    else echo "No Node.js dependencies found"; fi

# Set permissions for Apache
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html \
    && a2enmod rewrite

# Make server.py executable
RUN chmod +x /var/www/html/server.py

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Expose ports
# Expose ports
EXPOSE 8000 3000

# Start services
CMD ["sh", "-c", "node /var/www/html/server1.cjs & apache2-foreground"]
