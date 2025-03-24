# Use the official PHP Apache image
FROM php:8.2-apache

# Enable mod_rewrite (important for Laravel, WordPress, etc.)
RUN a2enmod rewrite

# Set working directory
WORKDIR /var/www/html

# Copy all project files to the container
COPY . /var/www/html

# Expose port 80 for web traffic
EXPOSE 80

# Start Apache in the foreground
CMD ["apache2-foreground"]
