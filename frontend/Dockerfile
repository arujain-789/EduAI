# Use the official PHP Apache image
FROM php:8.2-apache

# Set the working directory inside the container
WORKDIR /var/www/html

# Install required extensions
RUN apt-get update && \
    apt-get install -y \
        libpng-dev \
        libonig-dev \
        libxml2-dev \
        zip \
        unzip && \
    docker-php-ext-install \
        mysqli \
        pdo \
        pdo_mysql && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Copy all files
COPY . /var/www/html/

# Change ownership of files to Apache user
RUN chown -R www-data:www-data /var/www/html

# Expose port 80
EXPOSE 80

# Start Apache server
CMD ["apache2-foreground"]
